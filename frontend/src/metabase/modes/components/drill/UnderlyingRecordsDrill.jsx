import { ngettext, msgid } from "ttag";
import { inflect } from "metabase/lib/formatting";

export default ({ question, clicked }) => {
  // removes post-aggregation filter stage
  clicked = clicked && question.topLevelClicked(clicked);
  question = question.topLevelQuestion();

  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return [];
  }

  const dimensions = (clicked && clicked.dimensions) || [];
  if (!clicked || dimensions.length === 0) {
    return [];
  }

  // the metric value should be the number of rows that will be displayed
  const count = typeof clicked.value === "number" ? clicked.value : 2;

  const recordName = query.table() && query.table().displayName();
  const inflectedTableName = recordName
    ? inflect(recordName, count)
    : ngettext(msgid`record`, `records`, count);
  return [
    {
      name: "underlying-records",
      section: "records",
      buttonType: "horizontal",
      icon: "table_spaced",
      title: ngettext(
        msgid`View this ${inflectedTableName}`,
        `View these ${inflectedTableName}`,
        count,
      ),
      question: () => {
        return question.drillUnderlyingRecords(dimensions, clicked.column);
      },
    },
  ];
};
