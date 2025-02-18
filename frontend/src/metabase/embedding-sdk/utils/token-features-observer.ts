type Callback = () => void;
interface TokenFeatureObserver {
  _listeners: Callback[];
  _removeListener(callback: Callback): void;

  addListener(callback: Callback): void;
  notifyAndRemoveListeners(): void;
}
export const tokenFeatureObserver: TokenFeatureObserver = {
  _listeners: [],
  _removeListener(callback) {
    this._listeners = this._listeners.filter(listener => listener !== callback);
  },
  addListener(callback: Callback) {
    this._listeners.push(callback);
  },
  notifyAndRemoveListeners() {
    this._listeners.forEach(listener => listener());
    this._listeners = [];
  },
};
