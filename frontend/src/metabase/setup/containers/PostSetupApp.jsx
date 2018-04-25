/* @flow */

import React, { Component } from "react";

import { Link } from "react-router";
import ExplorePane from "metabase/components/ExplorePane";
import MetabotLogo from "metabase/components/MetabotLogo";
import Quotes from "metabase/components/Quotes";
import { withBackground } from "metabase/hoc/Background";

import { MetabaseApi, AutoApi } from "metabase/services";
import _ from "underscore";
import cx from "classnames";
import { t } from "c-3po";

const CANDIDATES_POLL_INTERVAL = 2000;
const CANDIDATES_TIMEOUT = 10000;

const QUOTES = [
  t`Metabot is admiring your integers…`,
  t`Metabot is performing billions of differential equations…`,
  t`Metabot is doing science…`,
  t`Metabot is checking out your metrics…`,
  t`Metabot is looking for trends and outliers…`,
  t`Metabot is consulting the quantum abacus…`,
  t`Metabot is feeling pretty good about all this…`,
];

import type { DatabaseCandidates } from "metabase/meta/types/Auto";

type Props = {
  params: {
    databaseId?: number,
  },
};
type State = {
  databaseId: ?number,
  isSample: ?boolean,
  candidates: ?DatabaseCandidates,
  sampleCandidates: ?DatabaseCandidates,
};

@withBackground("bg-slate-extra-light")
export default class PostSetupApp extends Component {
  props: Props;
  state: State = {
    databaseId: null,
    isSample: null,
    candidates: null,
    sampleCandidates: null,
  };

  _sampleTimeout: ?number;
  _pollTimer: ?number;

  // $FlowFixMe: doesn't expect componentWillMount to return Promise<void>
  async componentWillMount() {
    // If we get passed in a database id, just use that.
    // Don't fall back to the sample dataset
    if (this.props.params.databaseId) {
      this.setState({ databaseId: this.props.params.databaseId }, () => {
        this._loadCandidates();
      });
    } else {
      // Otherwise, it's a fresh start. Grab the last added database
      const [sampleDbs, otherDbs] = _.partition(
        await MetabaseApi.db_list(),
        db => db.is_sample,
      );
      if (otherDbs.length > 0) {
        this.setState({ databaseId: otherDbs[0].id, isSample: false }, () => {
          this._loadCandidates();
        });
        // If things are super slow for whatever reason,
        // just load candidates for sample dataset
        this._sampleTimeout = setTimeout(async () => {
          this._sampleTimeout = null;
          this.setState({
            sampleCandidates: await AutoApi.db_candidates({
              id: sampleDbs[0].id,
            }),
          });
        }, CANDIDATES_TIMEOUT);
      } else {
        this.setState({ databaseId: sampleDbs[0].id, isSample: true }, () => {
          this._loadCandidates();
        });
      }
      this._pollTimer = setInterval(
        this._loadCandidates,
        CANDIDATES_POLL_INTERVAL,
      );
    }
  }
  componentWillUnmount() {
    this._clearTimers();
  }
  _clearTimers() {
    if (this._pollTimer != null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._sampleTimeout != null) {
      clearInterval(this._sampleTimeout);
      this._sampleTimeout = null;
    }
  }
  _loadCandidates = async () => {
    try {
      const { databaseId } = this.state;
      if (databaseId != null) {
        const candidates = await AutoApi.db_candidates({
          id: databaseId,
        });
        if (candidates && candidates.length > 0) {
          this._clearTimers();
          this.setState({ candidates });
        }
      }
    } catch (e) {
      console.log(e);
    }
  };
  render() {
    let { candidates, sampleCandidates, isSample } = this.state;

    return (
      <div className="full-height">
        <div className="flex full-height">
          <div
            style={{ maxWidth: 587 }}
            className="ml-auto mr-auto mt-auto mb-auto py2"
          >
            {!candidates ? (
              <div>
                <h2 className="text-centered mx4 px4">
                  {t`We’ll show you some interesting explorations of your data in
                  just a few minutes.`}
                </h2>
                <BorderedPanel className="p4 my4 flex">
                  <MetabotLogo />
                  <div className="flex-full ml3 mt1">
                    <div className="mb1">
                      <Quotes quotes={QUOTES} period={2000} />
                    </div>
                    <ThinProgressBar />
                  </div>
                </BorderedPanel>
                {sampleCandidates && (
                  <BorderedPanel>
                    <ExplorePane
                      candidates={sampleCandidates}
                      title={null}
                      description={t`This seems to be taking a while. In the meantime, you can check out one of these example explorations to see what Metabase can do for you.`}
                    />
                  </BorderedPanel>
                )}
              </div>
            ) : (
              <BorderedPanel>
                <ExplorePane
                  candidates={candidates}
                  description={
                    isSample
                      ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples with sample data.`
                      : t`I took a look at the data you just connected, and I have some explorations of interesting things I found. Hope you like them!`
                  }
                />
              </BorderedPanel>
            )}
            <div className="m4 text-centered">
              <Link
                to="/"
                className="no-decoration text-bold text-grey-3 text-grey-4-hover"
              >
                {t`I'm done exploring for now`}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const BorderedPanel = ({ className, style, children }) => (
  <div
    className={cx("bordered rounded shadowed bg-white", className)}
    style={style}
  >
    {children}
  </div>
);

const ThinProgressBar = () => (
  <div className="bg-brand" style={{ height: 6, borderRadius: 99 }}>
    <div
      style={{
        backgroundColor: "black",
        opacity: 0.15,
        height: 6,
        width: 52,
      }}
    />
  </div>
);
