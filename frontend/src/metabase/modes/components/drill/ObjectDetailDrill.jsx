/* eslint-disable react/prop-types */
import { isFK, isPK } from "metabase/lib/schema_metadata";
import { t } from "ttag";

export default ({ question, clicked }) => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value === undefined ||
    !(isFK(clicked.column) || isPK(clicked.column))
  ) {
    return [];
  }

  let field = question.metadata().field(clicked.column.id);
  if (!field) {
    return [];
  }

  if (field.target) {
    field = field.target;
  }

  if (!clicked) {
    return [];
  }

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      buttonType: "horizontal",
      icon: "document",
      default: true,
      question: () =>
        field ? question.drillPK(field, clicked && clicked.value) : question,
    },
  ];
};
