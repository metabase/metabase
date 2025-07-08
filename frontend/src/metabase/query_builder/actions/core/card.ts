import Questions from "metabase/entities/questions";
import type { Dispatch, GetState } from "metabase-types/store";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  cardId: string | number,
  { dispatch, getState }: { dispatch: Dispatch; getState: GetState },
) {
  try {
    const action = (await dispatch(
      Questions.actions.fetch(
        { id: cardId },
        {
          properties: [
            "id",
            "dataset_query",
            "display",
            "visualization_settings",
          ], // complies with Card interface
        },
      ),
    )) as { payload: { result: number } };

    // In order to support entity ids,
    // `getObject` looks up the metadata with a numeric id,
    // so we must use the one from the Redux action.
    const numericCardId = action?.payload?.result ?? cardId;

    const question = Questions.selectors.getObject(getState(), {
      entityId: numericCardId,
    });

    return question?.card();
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
