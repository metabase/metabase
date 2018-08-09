/* @flow */

import React, { Component } from "react";
import { Link } from "react-router";
import cx from "classnames";
import { t } from "c-3po";

import fitViewport from "metabase/hoc/FitViewPort";

import CandidateListLoader from "metabase/containers/CandidateListLoader";

import Card from "metabase/components/Card";
import ExplorePane from "metabase/components/ExplorePane";
import MetabotLogo from "metabase/components/MetabotLogo";
import ProgressBar from "metabase/components/ProgressBar";
import Quotes from "metabase/components/Quotes";

type Props = {
  params: {
    databaseId?: number,
  },
  fitClassNames: string,
};

const QUOTES = [
  t`Metabot is admiring your integers…`,
  t`Metabot is performing billions of differential equations…`,
  t`Metabot is doing science…`,
  t`Metabot is checking out your metrics…`,
  t`Metabot is looking for trends and outliers…`,
  t`Metabot is consulting the quantum abacus…`,
  t`Metabot is feeling pretty good about all this…`,
];

@fitViewport
export default class PostSetupApp extends Component {
  props: Props;
  render() {
    return (
      <div className={cx(this.props.fitClassNames, "align-center")}>
        <div
          style={{ maxWidth: 587 }}
          className="ml-auto mr-auto mt-auto mb-auto py2"
        >
          <CandidateListLoader
            databaseId={this.props.params.databaseId}
            children={({ candidates, sampleCandidates, isSample }) => {
              if (!candidates) {
                return (
                  <div>
                    <h2 className="text-centered mx4 px4">
                      {t`We’ll show you some interesting explorations of your data in
                      just a few minutes.`}
                    </h2>
                    <Card p={4} my={4} className="flex">
                      <div className="mt1">
                        <MetabotLogo />
                      </div>
                      <div className="flex-full ml3 mt1">
                        <div className="mb1">
                          <Quotes quotes={QUOTES} period={2000} />
                        </div>
                        {/*The percentage is hardcoded so we can animate this*/}
                        <ProgressBar percentage={1} animated />
                      </div>
                    </Card>
                    {sampleCandidates && (
                      <Card>
                        <ExplorePane
                          candidates={sampleCandidates}
                          title={null}
                          description={t`This seems to be taking a while. In the meantime, you can check out one of these example explorations to see what Metabase can do for you.`}
                        />
                      </Card>
                    )}
                  </div>
                );
              }
              return (
                <Card px={3} py={1}>
                  <ExplorePane
                    candidates={candidates}
                    description={
                      isSample
                        ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples with sample data.`
                        : t`I took a look at the data you just connected, and I have some explorations of interesting things I found. Hope you like them!`
                    }
                  />
                </Card>
              );
            }}
          />
          <div className="m4 text-centered">
            <Link
              to="/"
              className="no-decoration text-bold text-medium text-medium-hover"
            >
              {t`I'm done exploring for now`}
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
