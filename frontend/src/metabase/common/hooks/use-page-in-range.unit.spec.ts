import { renderHook } from "@testing-library/react";

import { usePageInRange } from "./use-page-in-range";

const PAGE_SIZE = 50;

type SetupOpts = {
  page: number;
  total: number | undefined;
};

const setup = ({ page, total }: SetupOpts) => {
  const onPageChange = jest.fn();
  const { rerender } = renderHook(
    (props: SetupOpts) =>
      usePageInRange({ ...props, pageSize: PAGE_SIZE, onPageChange }),
    { initialProps: { page, total } },
  );
  return { onPageChange, rerender };
};

describe("usePageInRange", () => {
  it.each([
    { page: 0, total: 0 },
    { page: 0, total: PAGE_SIZE },
    { page: 1, total: PAGE_SIZE + 1 },
    { page: 2, total: PAGE_SIZE * 3 },
  ])("keeps page $page, which $total items reach", ({ page, total }) => {
    const { onPageChange } = setup({ page, total });

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it.each([
    { page: 1, total: PAGE_SIZE, lastPage: 0 },
    { page: 3, total: PAGE_SIZE + 1, lastPage: 1 },
    { page: 2, total: 0, lastPage: 0 },
  ])(
    "moves page $page back to page $lastPage, the last that $total items reach",
    ({ page, total, lastPage }) => {
      const { onPageChange } = setup({ page, total });

      expect(onPageChange).toHaveBeenCalledTimes(1);
      expect(onPageChange).toHaveBeenCalledWith(lastPage);
    },
  );

  it("waits while the total is unknown", () => {
    const { onPageChange } = setup({ page: 3, total: undefined });

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("moves back once the total shrinks below the page", () => {
    const { onPageChange, rerender } = setup({
      page: 1,
      total: PAGE_SIZE + 1,
    });
    expect(onPageChange).not.toHaveBeenCalled();

    rerender({ page: 1, total: PAGE_SIZE });

    expect(onPageChange).toHaveBeenCalledWith(0);
  });
});
