import { nanoid } from "@reduxjs/toolkit";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};
