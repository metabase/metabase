export function setTime(date: Date, time: Date) {
  const newDate = new Date(date);
  newDate.setHours(time.getHours(), time.getMinutes());
  return newDate;
}
