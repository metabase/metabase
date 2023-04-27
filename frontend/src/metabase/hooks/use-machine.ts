import { useCallback, useRef, useState } from "react";

type StateConfig<States> = {
  on?: {
    [A in Action<States>]?: keyof States;
  };
};
type StatesConfig<States> = Record<keyof States, StateConfig<States>>;
type MachineConfig<States> = {
  initialState: keyof States;
  states: StatesConfig<States>;
};

type ValueOf<T> = T[keyof T];
type ActionMap<States> = {
  [State in keyof States]: keyof States[State][keyof States[State]];
};
type Action<States> = ValueOf<ActionMap<States>>;
type Send<States> = (action: Action<States>) => void;
type UseMachineReturn<States> = [keyof States, Send<States>];

export function useMachine<Config extends MachineConfig<Config["states"]>>({
  initialState,
  states,
}: Config): UseMachineReturn<Config["states"]> {
  const statesRef = useRef(states);
  const [state, setState] = useState(initialState);
  const send = useCallback((action: Action<Config["states"]>) => {
    setState(state => {
      const nextState = statesRef.current[state].on?.[action];
      return nextState ?? state;
    });
  }, []);

  return [state, send];
}
