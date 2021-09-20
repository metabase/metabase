import React from "react";

const CARD_ID_ROW_IDX = 0;
const ErrorDrill = ({clicked}) => {
  if (!clicked) {
    return [];
  }

  const cardId = clicked.origin.row[CARD_ID_ROW_IDX];

  return [
    {
      name: "detail",
      title: `View this`,
      default: true,
      url() {
        return `/admin/tools/errors/${cardId}`;
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  drills: () => [ErrorDrill],
};

export default function ErrorDetail(props) {
  const { cardId } = props;
  ///// how to query the thingy?
  return (<div></div>)
}
