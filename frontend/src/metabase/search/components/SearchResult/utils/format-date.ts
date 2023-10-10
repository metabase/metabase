import moment from "moment/moment";

export const formatDate = (inputDate?: string | null) => {
  if (!inputDate) {
    return null;
  }
  const date = moment(inputDate);
  const today = moment().startOf("day");
  const yesterday = moment().subtract(1, "days").startOf("day");
  const lastWeek = moment().subtract(7, "days").startOf("day");

  if (date.isSame(today, "day")) {
    return `Today, ${date.format("h:mmA")}`;
  } else if (date.isSame(yesterday, "day")) {
    return `Yesterday, ${date.format("h:mmA")}`;
  } else if (date.isAfter(lastWeek)) {
    return `${date.format("dddd, h:mmA")}`;
  } else {
    return date.format("MMMM D, YYYY");
  }
};
