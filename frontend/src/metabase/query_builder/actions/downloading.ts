import { t } from "ttag";
import { getCardKey } from "metabase/visualizations/lib/utils";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/Question";

export const downloadImage = (question: Question) => async () => {
  const fileName = getImageFileName(question);
  const chartSelector = `[data-card-key='${getCardKey(question.id())}']`;
  await saveChartImage(chartSelector, fileName);
};

const getImageFileName = (question: Question) => {
  const name = question.displayName() ?? t`New question`;
  const date = new Date().toLocaleString();
  return `${name}-${date}.png`;
};
