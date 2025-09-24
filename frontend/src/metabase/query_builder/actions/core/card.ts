import Questions from "metabase/entities/questions";
import type { Dispatch, GetState } from "metabase-types/store";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  cardId: string | number,
  { dispatch, getState }: { dispatch: Dispatch; getState: GetState },
) {
  try {
    const result = (await dispatch(
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
    )) as {
      payload?: { question?: { id?: number } };
    };

    const question = Questions.selectors.getObject(getState(), {
      entityId: result?.payload?.question?.id ?? cardId,
    });

    return question?.card();
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
