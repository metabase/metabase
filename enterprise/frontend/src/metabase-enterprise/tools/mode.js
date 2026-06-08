import { push } from "react-router-redux";
import { t } from "ttag";

import { card } from "metabase/urls";

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
        return push(card({ id: cardId }));
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  fallback: (props) => ErrorDrill(props),
};
