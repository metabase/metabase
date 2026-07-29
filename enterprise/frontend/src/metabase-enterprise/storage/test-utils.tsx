import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import { useStorageSetup } from "metabase/common/components/upsells/StoragePurchaseModal";

/** Either the bare `userEvent` or an instance bound to jest fake timers. */
export type Clicker = Pick<ReturnType<typeof userEvent.setup>, "click">;

const TRIGGER_NAME = "Open purchase modal";

/**
 * Starts setup from any state — the panels only render their own purchase button
 * in one of them. Uses the same entry point that button does.
 */
export const PurchaseTrigger = () => {
  const { openPurchaseModal } = useStorageSetup();

  return <button onClick={openPurchaseModal}>{TRIGGER_NAME}</button>;
};

/** Takes the clicker because fake-clock tests need a bound `userEvent`. */
export const openPurchaseModal = async (user: Clicker = userEvent) => {
  await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));

  return await findPurchaseModal();
};

/** The modal can also be opened by a panel's own upsell button, not just `PurchaseTrigger`. */
export const findPurchaseModal = async () =>
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Test assertion against admin-only upsell copy
  await screen.findByRole("dialog", { name: "Add Metabase Storage" });

/** Confirms an already-open purchase modal, however it was opened. */
export const confirmPurchaseModal = async (user: Clicker = userEvent) => {
  const modal = await findPurchaseModal();
  await user.click(
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Test assertion against admin-only upsell copy
    within(modal).getByRole("button", { name: "Add Metabase Storage" }),
  );
};

export const confirmPurchase = async (user: Clicker = userEvent) => {
  await openPurchaseModal(user);
  await confirmPurchaseModal(user);
};

type DispatchSpy = { mock: { calls: unknown[][] } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const invalidatedTagsInclude = (
  dispatchSpy: DispatchSpy,
  types: string[],
): boolean =>
  dispatchSpy.mock.calls.some(([action]) => {
    if (!isRecord(action) || action.type !== "metabase-api/invalidateTags") {
      return false;
    }

    const tagTypes = (Array.isArray(action.payload) ? action.payload : []).map(
      (entry) => (isRecord(entry) ? entry.type : entry),
    );

    return types.every((type) => tagTypes.includes(type));
  });
