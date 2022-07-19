import React, { useEffect, useState } from "react";
import { render } from "@testing-library/react";

import { AsyncFn } from "metabase-types/types";

import { useMostRecentCall } from "./use-most-recent-call";

type TestAsyncFn = (num: number) => Promise<number>;

function TestComponent({
  trigger,
  asyncFn,
}: {
  trigger: number;
  asyncFn: TestAsyncFn;
}) {
  const [num, setNum] = useState(0);
  const fn = useMostRecentCall(asyncFn);

  useEffect(() => {
    fn(trigger)
      .then(res => {
        setNum(res);
      })
      .catch(err => {
        setNum(err);
      });
  }, [fn, trigger]);

  return <div>{num}</div>;
}

describe("useMostRecentCall", () => {
  it("should resolve with data once triggered", () => {
    const asyncFn = jest.fn(() => Promise.resolve(1));
    const { findByText } = render(
      <TestComponent asyncFn={asyncFn} trigger={1} />,
    );

    return findByText("1");
  });

  it("should only ever resolve last call's promise", async () => {
    const resolveFnMap: Record<number, () => void> = {};
    const asyncFn: TestAsyncFn = (num: number) =>
      new Promise(resolve => {
        resolveFnMap[num] = resolve.bind(null, num);
      });

    const { rerender, findByText } = render(
      <TestComponent asyncFn={asyncFn} trigger={1} />,
    );

    rerender(<TestComponent asyncFn={asyncFn} trigger={2} />);
    rerender(<TestComponent asyncFn={asyncFn} trigger={3} />);

    await findByText("0");

    // before most recent call resolves
    resolveFnMap[1]();
    // most recent call
    resolveFnMap[3]();
    // after most recent call resolves
    resolveFnMap[2]();

    await findByText("3");
  });

  it("should only reject last call's promise", async () => {
    const rejectFnMap: Record<number, () => void> = {};
    const asyncFn: TestAsyncFn = (num: number) =>
      new Promise((resolve, reject) => {
        rejectFnMap[num] = reject.bind(null, num);
      });

    const { rerender, findByText } = render(
      <TestComponent asyncFn={asyncFn} trigger={1} />,
    );

    rerender(<TestComponent asyncFn={asyncFn} trigger={2} />);
    rerender(<TestComponent asyncFn={asyncFn} trigger={3} />);

    await findByText("0");

    // before most recent call resolves
    rejectFnMap[1]();
    // most recent call
    rejectFnMap[3]();
    // after most recent call resolves
    rejectFnMap[2]();

    await findByText("3");
  });
});
