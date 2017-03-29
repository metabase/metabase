import React from 'react';
import MetabaseAnalytics from 'metabase/lib/analytics';

const EmbeddingLegalese = ({ updateSetting }) =>
    <div className="bordered rounded text-measure p4">
        <h3 className="text-brand">Using embedding</h3>
        <p className="text-grey-4" style={{ lineHeight: 1.48 }}>
            By enabling embedding you're agreeing to the embedding license located at <a className="link"  href="http://www.metabase.com/license/embedding" target="_blank">metabase.com/license/embedding</a>.
        </p>
        <p className="text-grey-4" style={{ lineHeight: 1.48 }}>            In plain english, when you embed charts or dashboards from Metabase in your own application, that application isn't subject to the Affero General Public License that covers the rest of Metabase, provided you keep the Metabase logo and the "Powered by Metabase" visible on those embeds.
            You should however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.
        </p>
        {/* TODO: contact form link */}
        {/* <p className="text-grey-4" style={{ lineHeight: 1.48 }}>
            If you want to hide the Metabase logo inside your own application we'd love to get in touch.
        </p> */}
        <div className="flex layout-centered mt4">
            <button
                className="Button Button--primary"
                onClick={() => {
                    MetabaseAnalytics.trackEvent("Admin Embed Settings", "Embedding Enable Click");
                    updateSetting(true);
                }}
            >
                Enable
            </button>
        </div>
    </div>

export default EmbeddingLegalese;
