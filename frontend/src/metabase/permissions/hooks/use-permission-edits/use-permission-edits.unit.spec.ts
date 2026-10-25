import { act, renderHook } from "@testing-library/react";

import { usePermissionEdits } from "./use-permission-edits";

type Permissions = Record<string, string>;
type Edit = { key: string; value: string };

const applyEdit = (
  permissions: Permissions,
  _saved: Permissions,
  edit: Edit,
) => ({
  ...permissions,
  [edit.key]: edit.value,
});

type SetupOpts = {
  saved: Permissions;
};

const setup = ({ saved }: SetupOpts) =>
  renderHook(({ saved }: SetupOpts) => usePermissionEdits(saved, applyEdit), {
    initialProps: { saved },
  });

describe("usePermissionEdits", () => {
  it("applies the edits over the saved permissions", () => {
    const { result } = setup({ saved: { a: "read", b: "none" } });

    act(() => result.current.addEdit({ key: "a", value: "write" }));

    expect(result.current.permissions).toEqual({ a: "write", b: "none" });
    expect(result.current.isDirty).toBe(true);
  });

  it("keeps the edits when the saved permissions change", () => {
    const { result, rerender } = setup({ saved: { a: "read", b: "none" } });

    act(() => result.current.addEdit({ key: "a", value: "write" }));
    rerender({ saved: { a: "read", b: "read" } });

    expect(result.current.permissions).toEqual({ a: "write", b: "read" });
  });

  it("drops edits that undo themselves, so later saved changes show", () => {
    const { result, rerender } = setup({ saved: { a: "read" } });

    act(() => result.current.addEdit({ key: "a", value: "write" }));
    act(() => result.current.addEdit({ key: "a", value: "read" }));
    expect(result.current.isDirty).toBe(false);

    rerender({ saved: { a: "none" } });

    expect(result.current.permissions).toEqual({ a: "none" });
    expect(result.current.isDirty).toBe(false);
  });
});
