import { startWorker } from 'jazz-nodejs';
import { Account, co, CoList, CoMap } from 'jazz-tools';
import { Config, Context, Data, Effect, Layer, Redacted } from 'effect';


type ShoppingListItem = {
  readonly name: string;
  readonly quantity: number;
  readonly emoji: string | null;
}

export class JazzConfig extends Context.Tag('JazzConfig')<
  JazzConfig,
  { account: string; password: Redacted.Redacted<string>; }
>() {
  static Live = Layer.effect(
    this,
    Config
      .all({
        account: Config.string('JAZZ_ACCOUNT'),
        password: Config.redacted('JAZZ_PASSWORD'),
        emailKey: Config.redacted('JAZZ_EMAIL_KEY'),
      }),
  );
}

export class JazzInitializationError
  extends Data.TaggedError('@app/JazzInitializationError')<{ cause: unknown; }> { }

export class ListItem extends CoMap {
  name = co.string;
  quantity = co.number;
  emoji = co.string;
}
class ListItems extends CoList.Of(co.ref(ListItem)) { }

class ListEntry extends CoMap {
  items = co.ref(ListItems);
  type = co.literal('todo', 'shopping');
}

class ListsList extends CoList.Of(co.ref(ListEntry)) { }

class MyWorkerAccount extends Account {
  root = co.ref(MyAppRoot);
}
class MyAppRoot extends CoMap {
  lists = co.ref(ListsList);
}

class JazzWorker extends Effect.Service<JazzWorker>()('JazzWorker', {
  effect: Effect.gen(function* () {
    const { worker } = yield* Effect.tryPromise({
      try: () =>
        startWorker({
          AccountSchema: MyWorkerAccount,
          syncServer: 'wss://cloud.jazz.tools/?key=you@example.com',
        }),

      catch: (e) => new JazzInitializationError({ cause: e }),
    });

    const createShoppingList = (items: ShoppingListItem[]) => {
      const newList = ListEntry.create({
        items: ListItems
          .create(items.map(({ emoji, name, quantity }) =>
            ListItem.create({
              name,
              quantity,
              emoji: emoji ?? '',
            })
          )),
        type: 'shopping',
      });
      worker.root?.lists?.push(newList);
      return newList;
    };

    const unsubscribe = worker.subscribe({ root: { lists: [] } }, (e) => {
      console.log('New list', e);
    });

    // const x = yield* Effect.tryPromise(() => worker.ensureLoaded({ root: {} }));
    // console.log('worker', x);
    console.log('worker root', worker.root);
    console.log('worker lists', worker.root?.lists);

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Jazz worker stopping');
        unsubscribe?.();
        yield* Effect.logDebug('Jazz worker stopped');
      })
    );

    yield* Effect.logDebug('Jazz worker started');

    return {
      createShoppingList,
      worker,
    };
  }),
}) { }

export class ListsRepo extends Effect.Service<ListsRepo>()('ListsRepo', {
  dependencies: [JazzWorker.Default],
  effect: Effect.gen(function* () {
    const jazz = yield* JazzWorker;
    const createShoppingList = (items: ShoppingListItem[], chatId: string) =>
      Effect.gen(function* () {
        const jazzList = jazz.createShoppingList(items);

        yield* Effect
          .logInfo(`Created shopping Jazz list ${jazzList.id} for chat ${chatId}`);
        yield* Effect.logDebug(jazzList);
      });

    return {
      createShoppingList,
    };
  }),
}) { }
