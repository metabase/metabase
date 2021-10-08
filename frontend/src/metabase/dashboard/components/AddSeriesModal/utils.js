import { getIn } from "icepick";

export function isQuestionCompatible(
  visualization,
  dashcard,
  dashcardData,
  question,
) {
  const initialSeries = {
    card: dashcard.card,
    data: getIn(dashcardData, [dashcard.id, dashcard.card.id, "data"]),
  };

  try {
    if (question.id() === dashcard.card.id) {
      return false;
    }

    if (question.isStructured()) {
      if (
        !visualization.seriesAreCompatible(initialSeries, {
          card: question.card(),
          data: { cols: question.query().columns(), rows: [] },
        })
      ) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}
