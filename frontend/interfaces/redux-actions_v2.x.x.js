// Origin: https://github.com/flowtype/flow-typed/blob/master/definitions/npm/redux-actions_v2.x.x/flow_v0.34.x-/redux-actions_v2.x.x.js

declare module "redux-actions" {
  /*
   * Use `ActionType` to get the type of the action created by a given action
   * creator. For example:
   *
   *     import { creatAction, type ActionType } from 'redux-actions'
   *
   *     const increment = createAction(INCREMENT, (count: number) => count)
   *
   *     function myReducer(state: State = initState, action: ActionType<typeof increment>): State {
   *       // Flow will infer that the type of `action.payload` is `number`
   *     }
   */
  declare type ActionType<ActionCreator> = _ActionType<*, ActionCreator>;
  declare type _ActionType<R, Fn: (payload: *, ...rest: any[]) => R> = R;

  /*
   * To get the most from Flow type checking use a `payloadCreator` argument
   * with `createAction`. Make sure that Flow can infer the argument type of the
   * `payloadCreator`. That will allow Flow to infer the payload type of actions
   * created by that action creator in other parts of the program. For example:
   *
   *     const increment = createAction(INCREMENT, (count: number) => count)
   *
   */
  declare function createAction<T, P>(
    type: T,
    $?: empty, // hack to force Flow to not use this signature when more than one argument is given
  ): (payload: P, ...rest: any[]) => { type: T, payload: P, error?: boolean };

  declare function createAction<T, P, P2>(
    type: T,
    payloadCreator: (_: P) => P2,
    $?: empty,
  ): (payload: P, ...rest: any[]) => { type: T, payload: P2, error?: boolean };

  declare function createAction<T, P, P2, M>(
    type: T,
    payloadCreator: (_: P) => P2,
    metaCreator: (_: P) => M,
  ): (
    payload: P,
    ...rest: any[]
  ) => { type: T, payload: P2, error?: boolean, meta: M };

  declare function createAction<T, P, M>(
    type: T,
    payloadCreator: null | void,
    metaCreator: (_: P) => M,
  ): (
    payload: P,
    ...rest: any[]
  ) => { type: T, payload: P, error?: boolean, meta: M };

  // `createActions` is quite difficult to write a type for. Maybe try not to
  // use this one?
  declare function createActions(
    actionMap: Object,
    ...identityActions: string[]
  ): Object;
  declare function createActions(...identityActions: string[]): Object;

  declare type Reducer<S, A> = (state: S, action: A) => S;

  declare type ReducerMap<S, A> =
    | { next: Reducer<S, A> }
    | { throw: Reducer<S, A> }
    | { next: Reducer<S, A>, throw: Reducer<S, A> };

  /*
   * To get full advantage from Flow, use a type annotation on the action
   * argument to your reducer when creating a reducer with `handleAction` or
   * `handleActions`. For example:
   *
   *     import { type Reducer } from 'redux'
   *     import { createAction, handleAction, type Action } from 'redux-actions'
   *
   *     const increment = createAction(INCREMENT, (count: number) => count)
   *
   *     const reducer = handleAction(INCREMENT, (state, { payload }: ActionType<typeof increment>) => {
   *       // Flow infers that the type of `payload` is number
   *     }, defaultState)
   */
  declare function handleAction<Type, State, Action: { type: Type }>(
    type: Type,
    reducer: Reducer<State, Action> | ReducerMap<State, Action>,
    defaultState: State,
  ): Reducer<State, Action>;

  declare function handleActions<State, Action>(
    reducers: {
      [key: string]: Reducer<State, Action> | ReducerMap<State, Action>,
    },
    defaultState?: State,
  ): Reducer<State, Action>;

  declare function combineActions(
    ...types: (string | Symbol | Function)[]
  ): string;
}
