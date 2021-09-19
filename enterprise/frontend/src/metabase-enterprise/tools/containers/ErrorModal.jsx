

const ErrorDrill = ({
  question,
  clicked,
} => {
  if (!clicked) {
    return [];
  }
  return [
    {
      name: "detail",
      title: `View this`,
      default: true,
      url() {
        return `/admin/tools/modal/${value}`;          },
    },
  ];
};

