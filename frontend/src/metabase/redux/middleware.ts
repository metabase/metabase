import type { History } from "history";
import { routerMiddleware } from "react-router-redux";
import { navbarRouterHistorySyncMiddleware } from './app';

export const getRouterMiddleware = (history: History) => {
  if (!history) return [];

  return [navbarRouterHistorySyncMiddleware(history)];
};
