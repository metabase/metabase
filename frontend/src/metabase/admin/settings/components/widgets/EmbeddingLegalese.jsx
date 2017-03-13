import React from 'react';

const EmbeddingLegalese = () =>
    <div className="bordered rounded text-measure p4">
        <h3 className="text-brand">Using embedding</h3>
        <p className="text-grey-4" style={{ lineHeight: 1.48 }}>
            By enabling you agree to use the core file (embedding.js), which is available in a non-AGPL license (full terms found at <a className="link"  href="http://www.metabase.com/license/embedding" target="_blank">metabase.com/license/embedding</a>). In plain english, you’re welcome to embed any Metabase charts or dashboards in your application, for free, with none of the obligations under the AGPL so long as you do not remove or hide our logo.
        </p>
    </div>

export default EmbeddingLegalese;
