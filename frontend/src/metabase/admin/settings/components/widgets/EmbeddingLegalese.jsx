import React from 'react';

const EmbeddingLegalese = () =>
    <div className="bordered rounded text-measure p4">
        <h3 className="text-brand">Using embedding</h3>
        <p className="text-grey-4" style={{ lineHeight: 1.48 }}>
            By enabling this feature you agree to use the core file (embedding.js), 
            which is available in a non-AGPL license (full terms found at 
            <a className="link"  href="http://www.metabase.com/license/embedding" target="_blank"> www.metabase.com/license/embedding</a>). 
            In plain English, you’re welcome to embed any Metabase charts or dashboards in your application, 
            for free, with none of the obligations under the AGPL so long as you do not remove or hide our logo. 
            You should however, read the license text linked above as that is the actual license that you will 
        	be agreeing to by enabling this feature.
        </p>
    </div>

export default EmbeddingLegalese;
