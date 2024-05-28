import { push } from "react-router-redux";
import { t } from "ttag";

const CARD_ID_ROW_IDX = 0;

const ErrorDrill = ({ clicked }) => {
  if (!clicked) {
    return [];
  }

  const cardId = clicked.origin.row[CARD_ID_ROW_IDX];

  return [
    {
      name: "detail",
      title: t`View this`,
      default: true,
      action() {
        return push(`/admin/tools/errors/${cardId}`);
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  drills: [ErrorDrill],
};
