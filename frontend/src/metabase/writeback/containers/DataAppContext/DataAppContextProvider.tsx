import React, { useMemo } from "react";
import { connect } from "react-redux";
import _ from "lodash";
import { getIn } from "icepick";

import {
  getDashcards,
  getCardData,
  getIsLoadingComplete,
} from "metabase/dashboard/selectors";

import { CardId } from "metabase-types/types/Card";
import { DashCard, DashCardId } from "metabase-types/types/Dashboard";
import { Dataset } from "metabase-types/types/Dataset";
import { State } from "metabase-types/store";

import {
  DataAppContext,
  DataAppContextType,
  DataContextType,
} from "./DataAppContext";
import {
  formatDataAppString,
  turnRawDataIntoObjectDetail,
  turnRawDataIntoListInfo,
} from "./utils";

interface DataAppContextProviderOwnProps {
  children: React.ReactNode;
}

interface DataAppContextProviderStateProps {
  dashCards: Record<DashCardId, DashCard>;
  dashCardData: Record<DashCardId, Record<CardId, Dataset>>;
  isLoaded: boolean;
}

type DataAppContextProviderProps = DataAppContextProviderOwnProps &
  DataAppContextProviderStateProps;

function mapStateToProps(state: State) {
  return {
    dashCards: getDashcards(state),
    dashCardData: getCardData(state),
    isLoaded: getIsLoadingComplete(state),
  };
}

function DataAppContextProvider({
  dashCards = [],
  dashCardData = {},
  isLoaded,
  children,
}: DataAppContextProviderProps) {
  const objectDetails = useMemo(
    () =>
      Object.values(dashCards).filter(
        dashCard => dashCard.card.display === "object",
      ),
    [dashCards],
  );

  const listsAndTables = useMemo(
    () =>
      Object.values(dashCards).filter(dashCard => {
        const { display } = dashCard.card;
        return display === "table" || display === "list";
      }),
    [dashCards],
  );

  const dataContext = useMemo(() => {
    const context: DataContextType = {};

    objectDetails.forEach(dashCard => {
      const formattedCardName = _.camelCase(dashCard.card.name);
      const data = getIn(dashCardData, [dashCard.id, dashCard.card.id]);
      if (data) {
        context[formattedCardName] = turnRawDataIntoObjectDetail(data);
      }
    });

    listsAndTables.forEach(dashCard => {
      const formattedCardName = _.camelCase(dashCard.card.name);
      const data = getIn(dashCardData, [dashCard.id, dashCard.card.id]);
      if (data) {
        context[formattedCardName] = turnRawDataIntoListInfo(data);
      }
    });

    return context;
  }, [objectDetails, listsAndTables, dashCardData]);

  const context: DataAppContextType = useMemo(() => {
    const value: DataAppContextType = {
      data: dataContext,
      isLoaded,
      format: (text: string) => text,
    };

    value.format = (text: string) => formatDataAppString(text, value);

    console.log(
      [
        "Data app context",
        "(can be used for parameterized text cards and data app title)",
        "Syntax: {{ data.camelCaseCardName.columnName }}, follow the object structure below",
      ].join("\n"),
      context,
    );

    return value;
  }, [dataContext, isLoaded]);

  return (
    <DataAppContext.Provider value={context}>
      {children}
    </DataAppContext.Provider>
  );
}

export default connect<
  DataAppContextProviderStateProps,
  unknown,
  DataAppContextProviderStateProps,
  State
>(mapStateToProps)(DataAppContextProvider);
