export const getNextId = (() => {
  let id = 0;
  return () => ++id;
})();

export const mockLocalStorageGlobally = () => {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    getItem(key: string) {
      return store.get(key) || null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index];
    },
    get length() {
      return store.size;
    },
  };
  const realLocalStorage = localStorage;
  global.localStorage = mockStorage;
  return { realLocalStorage };
};
