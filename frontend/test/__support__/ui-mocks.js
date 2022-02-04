jest.mock("metabase/components/Popover");

// Replace addEventListener with a test implementation which collects all event listeners to `eventListeners` map
export const eventListeners = {};

const testAddEventListener = jest.fn((event, listener) => {
  eventListeners[event] = eventListeners[event]
    ? [...eventListeners[event], listener]
    : [listener];
});

const testRemoveEventListener = jest.fn((event, listener) => {
  eventListeners[event] = (eventListeners[event] || []).filter(
    l => l !== listener,
  );
});

global.document.addEventListener = testAddEventListener;
global.window.addEventListener = testAddEventListener;
global.document.removeEventListener = testRemoveEventListener;
global.window.removeEventListener = testRemoveEventListener;
