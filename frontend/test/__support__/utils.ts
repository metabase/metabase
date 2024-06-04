import { act } from "./ui";

export const getNextId = (() => {
  let id = 0;
  return () => ++id;
})();

export async function delay(duration: number) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, duration));
  });
}
