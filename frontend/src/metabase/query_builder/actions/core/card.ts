import Questions from "metabase/entities/questions";
import type { CardId } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  cardId: CardId,
  { dispatch, getState }: { dispatch: Dispatch; getState: GetState },
) {
  try {
    await dispatch(
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
    );

    const question = Questions.selectors.getObject(getState(), {
      entityId: cardId,
    });

    return question?.card();
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
