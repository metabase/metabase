import Questions from "metabase/entities/questions";
import type { Dispatch } from "metabase-types/store";

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(
  cardId: string | number,
  { dispatch }: { dispatch: Dispatch },
) {
  try {
    const action = await dispatch(
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

    return Questions.HACK_getObjectFromAction(action);
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}
