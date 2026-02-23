export const contentTranslationEndpoints = {
  /** This endpoint, which includes a JSON Web Token, is set in static embedding */
  getDictionary: null as string | null,
  uploadDictionary: "/api/ee/content-translation/upload-dictionary",
  getCSV: "/api/ee/content-translation/csv",
};

// Store for getDictionary endpoint with subscription support for React
type Listener = () => void;
const listeners = new Set<Listener>();

export const dictionaryEndpointStore = {
  getSnapshot: () => contentTranslationEndpoints.getDictionary,
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setEndpoint: (endpoint: string | null) => {
    if (contentTranslationEndpoints.getDictionary !== endpoint) {
      contentTranslationEndpoints.getDictionary = endpoint;
      listeners.forEach((listener) => listener());
    }
  },
};
