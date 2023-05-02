type MockEvent = {
  preventDefault: jest.Mock;
  returnValue?: string;
};

type CallMockEventType = (
  mockEventListener: jest.SpyInstance,
  eventName: string,
) => MockEvent;

// calls event handler in the mockEventListener that matches the eventName
// and uses the mockEvent to hold the callback's return value
export const callMockEvent: CallMockEventType = (
  mockEventListener: jest.SpyInstance,
  eventName: string,
) => {
  const mockEvent = {
    preventDefault: jest.fn(),
  };

  mockEventListener.mock.calls
    .filter(([event]) => eventName === event)
    .forEach(([_, callback]) => callback(mockEvent));
  return mockEvent;
};
