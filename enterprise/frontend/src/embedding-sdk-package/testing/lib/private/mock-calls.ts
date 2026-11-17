export type MockCalls<TCall> = {
  calls: () => readonly TCall[];
  lastCall: () => TCall | undefined;
};

export function createMockCalls<TCall>() {
  const calls: TCall[] = [];

  return {
    record: (call: TCall) => {
      calls.push(call);
    },
    calls: () => calls,
    lastCall: () => calls.at(-1),
  };
}
