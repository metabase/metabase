

const CARD_ID_ROW_IDX = 0;

export const handleErrorDrill = (clicked) => {
  if (!clicked) {
    return [];
  }

  console.log(clicked);

  const cardId = clicked.origin.row[CARD_ID_ROW_IDX];

  console.log([
    {
      name: "detail",
      title: `View this`,
      default: true,
      url() {
        return `/admin/tools/modal/${cardId}`;
      },
    },
  ]);
};

