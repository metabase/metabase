export function setTime(date: Date, time: Date) {
  const newDate = new Date(date);
  newDate.setHours(time.getHours(), time.getMinutes());
  return newDate;
}

export function hasTimeParts(date: Date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}
