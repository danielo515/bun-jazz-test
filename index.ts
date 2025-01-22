import { BunRuntime } from '@effect/platform-bun';
import { Effect, Logger, LogLevel, Schedule } from 'effect';
import { ListsRepo } from './src/ListsRepo';

const program = Effect
  .gen(function* () {
    const lists = yield* ListsRepo;

    yield* lists
      .createShoppingList([
        { emoji: '🍔', name: 'Hamburguesa', quantity: 2 },
        { emoji: '🍪', name: 'Galletas', quantity: 1 },
      ], '123')
      .pipe(Effect
        .repeat(Schedule.addDelay(Schedule.recurs(2), () => '10 second')));
  });

program.pipe(
  Effect.provide(ListsRepo.Default),
  Effect.provide(Logger
    .minimumLogLevel(LogLevel.Debug)),
  Effect.scoped,
  BunRuntime.runMain,
);
