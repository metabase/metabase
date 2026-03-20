import { cardApi } from "metabase/api";
import type { Card } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import type { Dispatch, GetState } from "metabase-types/store";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  {
    cardId,
    token,
  }: {
    cardId: string | number;
    token?: EntityToken | null;
  },
  { dispatch }: { dispatch: Dispatch; getState: GetState },
): Promise<Card> {
  try {
    const result = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: token ?? cardId }),
    );

    if (result.data != null) {
      return result.data;
    }

    throw new Error("Failed to fetch card");
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
