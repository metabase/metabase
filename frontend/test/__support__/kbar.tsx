import { act } from "@testing-library/react";
import { type KBarQuery, useKBar } from "kbar";
import { type ReactElement, useEffect, useState } from "react";

import {
  type RenderWithProvidersOptions,
  renderWithProviders,
} from "__support__/ui";
import type { KeyboardShortcutId } from "metabase/palette/shortcuts";
import { checkNotNull } from "metabase/utils/types";

type RegisterActionsSpy = jest.SpiedFunction<KBarQuery["registerActions"]>;

type ProbeProps = {
  onQuery: (query: KBarQuery) => void;
};

const KBarQueryProbe = ({ onQuery }: ProbeProps) => {
  const { query } = useKBar();
  onQuery(query);
  return null;
};

/**
 * Renders `ui` with a kbar provider and spies on `query.registerActions`.
 *
 * The spy also sees the first registration: kbar registers actions in an
 * effect, and React renders the whole tree before it runs an effect.
 *
 * Pass a component element, not a `<Route>`. `rerender` updates the element
 * in place, also under `withRouter`, and keeps the same spy.
 */
export const renderWithRegisterActionsSpy = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) => {
  let registerActions: RegisterActionsSpy | undefined;
  const holder: { setElement?: (element: ReactElement) => void } = {};
  const onQuery = (query: KBarQuery) => {
    registerActions ??= jest.spyOn(query, "registerActions");
  };

  const ElementHolder = () => {
    const [element, setElement] = useState(ui);
    useEffect(() => {
      holder.setElement = setElement;
    }, []);
    return (
      <>
        <KBarQueryProbe onQuery={onQuery} />
        {element}
      </>
    );
  };

  renderWithProviders(<ElementHolder />, { ...options, withKBar: true });

  // Other components also register actions; count only the calls with `id`.
  const getRegistrationsOf = (id: KeyboardShortcutId) =>
    registerActions?.mock.calls.filter(([actions]) =>
      actions.some((action) => action.id === id),
    ) ?? [];

  return {
    rerender: (element: ReactElement) =>
      act(() => checkNotNull(holder.setElement)(element)),
    getRegisterActions: () => registerActions,
    getRegistrationsOf,
  };
};
