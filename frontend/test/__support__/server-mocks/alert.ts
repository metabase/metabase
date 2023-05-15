import fetchMock from "fetch-mock";
import { Alert, Card } from "metabase-types/api";

export function setupAlertsEndpoints(card: Card, alerts: Alert[]) {
  fetchMock.get(`path:/api/alert/question/${card.id}`, alerts);
}
