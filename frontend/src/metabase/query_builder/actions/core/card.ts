import { cardApi } from "metabase/api";
import type { Dispatch, GetState } from "metabase/redux/store";
import type { Card } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  {
    cardId,
    token,
    forceRefetch = false,
  }: {
    cardId: string | number;
    token?: EntityToken | null;
    forceRefetch?: boolean;
  },
  { dispatch }: { dispatch: Dispatch; getState: GetState },
) {
  try {
    // Unjustified type cast. FIXME
    const result = (await dispatch(
      cardApi.endpoints.getCard.initiate(
        { id: token ?? cardId },
        { forceRefetch },
      ),
    )) as { data?: Card; error?: unknown };

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      throw new Error("Card not found");
    }

    return result.data;
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
