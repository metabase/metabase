import invariant from "invariant";
import { connect } from "react-redux";
import authWrapper from "redux-auth-wrapper/authWrapper";
import locationHelperBuilder from "redux-auth-wrapper/history3/locationHelper";
import Redirect from "redux-auth-wrapper/redirect";

import { MetabaseReduxContext } from "./lib/redux";

const connectedDefaults = {
  authenticatingSelector: () => false,
  allowRedirectBack: true,
  FailureComponent: Redirect,
  redirectQueryParamName: "redirect",
};

const redirectUtil = ({ locationHelperBuilder, getRouterRedirect }) => {
  const connectedRouterRedirect = args => {
    const allArgs = { ...connectedDefaults, ...args };
    const {
      FailureComponent,
      redirectPath,
      authenticatedSelector,
      authenticatingSelector,
      allowRedirectBack,
      redirectQueryParamName,
    } = allArgs;

    const { createRedirectLoc } = locationHelperBuilder({
      redirectQueryParamName,
    });

    let redirectPathSelector;
    if (typeof redirectPath === "string") {
      redirectPathSelector = () => redirectPath;
    } else if (typeof redirectPath === "function") {
      redirectPathSelector = redirectPath;
    } else {
      invariant(false, "redirectPath must be either a string or a function");
    }

    let allowRedirectBackFn;
    if (typeof allowRedirectBack === "boolean") {
      allowRedirectBackFn = () => allowRedirectBack;
    } else if (typeof allowRedirectBack === "function") {
      allowRedirectBackFn = allowRedirectBack;
    } else {
      invariant(
        false,
        "allowRedirectBack must be either a boolean or a function",
      );
    }

    const redirect = replace => (props, path) =>
      replace(createRedirectLoc(allowRedirectBackFn(props, path))(props, path));

    const ConnectedFailureComponent = connect(
      (state, ownProps) => ({
        redirect: redirect(getRouterRedirect(ownProps)),
      }),
      undefined,
      undefined,
      { context: MetabaseReduxContext },
    )(FailureComponent);

    return DecoratedComponent =>
      connect(
        (state, ownProps) => (
          {
            redirectPath: redirectPathSelector(state, ownProps),
            isAuthenticated: authenticatedSelector(state, ownProps),
            isAuthenticating: authenticatingSelector(state, ownProps),
          },
          undefined,
          undefined,
          { context: MetabaseReduxContext }
        ),
      )(
        authWrapper({
          ...allArgs,
          FailureComponent: ConnectedFailureComponent,
        })(DecoratedComponent),
      );
  };

  const connectedReduxRedirect = args => {
    const allArgs = { ...connectedDefaults, ...args };
    const {
      FailureComponent,
      redirectPath,
      authenticatedSelector,
      authenticatingSelector,
      allowRedirectBack,
      redirectAction,
      redirectQueryParamName,
    } = allArgs;

    const { createRedirectLoc } = locationHelperBuilder({
      redirectQueryParamName,
    });

    let redirectPathSelector;
    if (typeof redirectPath === "string") {
      redirectPathSelector = () => redirectPath;
    } else if (typeof redirectPath === "function") {
      redirectPathSelector = redirectPath;
    } else {
      invariant(false, "redirectPath must be either a string or a function");
    }

    let allowRedirectBackFn;
    if (typeof allowRedirectBack === "boolean") {
      allowRedirectBackFn = () => allowRedirectBack;
    } else if (typeof allowRedirectBack === "function") {
      allowRedirectBackFn = allowRedirectBack;
    } else {
      invariant(
        false,
        "allowRedirectBack must be either a boolean or a function",
      );
    }

    const createRedirect = dispatch => ({
      redirect: (props, path) =>
        dispatch(
          redirectAction(
            createRedirectLoc(allowRedirectBackFn(props, path))(props, path),
          ),
        ),
    });

    const ConnectedFailureComponent = connect(null, createRedirect, undefined, {
      context: MetabaseReduxContext,
    })(FailureComponent);

    return DecoratedComponent =>
      connect(
        (state, ownProps) => ({
          redirectPath: redirectPathSelector(state, ownProps),
          isAuthenticated: authenticatedSelector(state, ownProps),
          isAuthenticating: authenticatingSelector(state, ownProps),
        }),
        undefined,
        undefined,
        { context: MetabaseReduxContext },
      )(
        authWrapper({
          ...allArgs,
          FailureComponent: ConnectedFailureComponent,
        })(DecoratedComponent),
      );
  };

  return {
    connectedRouterRedirect,
    connectedReduxRedirect,
  };
};

export const { connectedRouterRedirect, connectedReduxRedirect } = redirectUtil(
  {
    locationHelperBuilder,
    getRouterRedirect: ({ router }) => router.replace,
  },
);

const onEnterDefaults = {
  allowRedirectBack: true,
  authenticatingSelector: () => false,
  redirectQueryParamName: "redirect",
};

export const createOnEnter = config => {
  const {
    authenticatedSelector,
    authenticatingSelector,
    redirectPath,
    allowRedirectBack,
    redirectQueryParamName,
  } = {
    ...onEnterDefaults,
    ...config,
  };

  let redirectPathSelector;
  if (typeof redirectPath === "string") {
    redirectPathSelector = () => redirectPath;
  } else if (typeof redirectPath === "function") {
    redirectPathSelector = redirectPath;
  } else {
    invariant(false, "redirectPath must be either a string or a function");
  }

  let allowRedirectBackFn;
  if (typeof allowRedirectBack === "boolean") {
    allowRedirectBackFn = () => allowRedirectBack;
  } else if (typeof allowRedirectBack === "function") {
    allowRedirectBackFn = allowRedirectBack;
  } else {
    invariant(
      false,
      "allowRedirectBack must be either a boolean or a function",
    );
  }

  return (store, nextState, replace) => {
    const { createRedirectLoc } = locationHelperBuilder({
      redirectQueryParamName,
    });

    const isAuthenticated = authenticatedSelector(store.getState(), nextState);
    const isAuthenticating = authenticatingSelector(
      store.getState(),
      nextState,
    );

    if (!isAuthenticated && !isAuthenticating) {
      const redirectPath = redirectPathSelector(store.getState(), nextState);
      replace(
        createRedirectLoc(allowRedirectBackFn(nextState, redirectPath))(
          nextState,
          redirectPath,
        ),
      );
    }
  };
};
