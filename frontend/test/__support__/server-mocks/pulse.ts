import fetchMock from "fetch-mock";

export function setupPulseEndpoint(channelData = { channels: {} }) {
  fetchMock.get("path:/api/pulse/form_input", channelData);
}
