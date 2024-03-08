import FakeTimers from "@sinonjs/fake-timers";
import Cookie from "js-cookie";
import { replace } from "react-router-redux";

import { logout, refreshSession } from "metabase/auth/actions";

import {
  createSessionMiddleware,
  SESSION_KEY,
  COOKIE_POOLING_TIMEOUT,
} from "./session-middleware";

jest.mock("js-cookie", () => jest.fn());
jest.mock("metabase/auth/actions", () => ({
  logout: jest.fn(),
  refreshSession: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-router-redux", () => ({
  replace: jest.fn(),
}));

let clock;

const actionStub = { type: "ANY_ACTION" };

/**
 * TODO: better solution is to provide configurable window object
 * it will be possible after migration to more recent react-router (5+)
 *
 * Changes the URL used by the global JSDOM instance in the current window.
 * jsdom is making more and more properties non-configurable
 * ref https://github.com/jsdom/jsdom/issues/3492
 *
 * NOTE: This does not change the origin which would result in a security exception.
 */
function changeJSDOMURL(url) {
  const newURL = new URL(url);
  const href = `${window.origin}${newURL.pathname}${newURL.search}${newURL.hash}`;
  history.replaceState(history.state, null, href);
}

const setup = () => {
  const dispatchMock = jest.fn();
  const storeMock = { dispatch: dispatchMock };
  const nextMock = jest.fn();

  const sessionMiddleware = createSessionMiddleware(
    [],
    clock.setInterval.bind(clock),
  );

  return {
    handleAction: sessionMiddleware(storeMock)(nextMock),
    dispatchMock,
    nextMock,
  };
};

describe("createSessionMiddleware", () => {
  beforeEach(() => {
    clock = FakeTimers.createClock();
  });

  it("should read metabase.TIMEOUT cookie to check the session", () => {
    Cookie.get = jest.fn();

    const { handleAction } = setup();

    handleAction(actionStub);

    expect(Cookie.get).toHaveBeenCalledWith(SESSION_KEY);
  });

  it("should call next function", () => {
    Cookie.get = jest.fn();

    const { handleAction, nextMock } = setup();

    handleAction(actionStub);

    expect(nextMock).toHaveBeenCalledWith(actionStub);
  });

  describe("when logged in", () => {
    beforeEach(() => {
      changeJSDOMURL("https://metabase.com/question/1?query=5#hash");
    });

    it("should not dispatch the logout action when session exists", () => {
      Cookie.get = jest
        .fn()
        .mockImplementationOnce(() => "alive")
        .mockImplementationOnce(() => "alive");

      const { handleAction, dispatchMock } = setup();

      handleAction(actionStub);

      clock.tick(COOKIE_POOLING_TIMEOUT);

      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it("should keep being logged in not dispatching any actions", () => {
      Cookie.get = jest
        .fn()
        .mockImplementationOnce(() => "alive")
        .mockImplementationOnce(() => undefined);

      const { handleAction, dispatchMock } = setup();

      handleAction(actionStub);

      clock.tick(COOKIE_POOLING_TIMEOUT);

      expect(dispatchMock).toHaveBeenCalled();
      expect(logout).toHaveBeenCalledWith("/question/1?query=5#hash");
    });
  });

  describe("logged in redirect", () => {
    beforeEach(() => {
      changeJSDOMURL(
        "https://metabase.com/auth/login?redirect=%2Fquestion%2F1%3Fquery%3D5%23hash",
      );
    });

    it("should redirect to the redirectUrl", async () => {
      Cookie.get = jest
        .fn()
        .mockImplementationOnce(() => "alive")
        .mockImplementationOnce(() => "alive");

      const { handleAction, dispatchMock } = setup();

      handleAction(actionStub);
      clock.tick(COOKIE_POOLING_TIMEOUT);

      expect(dispatchMock).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith("/question/1?query=5#hash");
    });
  });

  describe("when not logged in", () => {
    beforeEach(() => {
      changeJSDOMURL(
        "http://localhost/auth/login?redirect=%2Fquestion%2F1%3Fquery%3D5%23hash",
      );
    });

    it("should redirect to the redirectUrl when a session appears", async () => {
      Cookie.get = jest
        .fn()
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => "alive");

      const { handleAction, dispatchMock } = setup();

      handleAction(actionStub);

      clock.tick(COOKIE_POOLING_TIMEOUT);

      expect(dispatchMock).toHaveBeenCalled();
      expect(refreshSession).toHaveBeenCalledWith();

      // wait for the refreshSession to resolve
      await Promise.resolve();

      expect(replace).toHaveBeenCalledWith("/question/1?query=5#hash");
    });
  });
});
