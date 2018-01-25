import React from 'react'
import { Box, Provider } from 'rebass'

import { injectGlobal } from 'styled-components'

injectGlobal`
  * { box-sizing: border-box; }
  body { margin: 0; }
  ol, ul { padding: 0; }
  li { list-style-type: none; },
  a {
      color: #509ee3;
      text-decoration: none;
  },
  a:hover {
      text-decoration: underline;
  }
`

// render based on the current state of the world
function render(response) {
    const { params, body } = response 
    const {
        layout:Layout,
        view:View
    } = body

    return (
        <Provider
            theme={{
                font: '"Lato", "Helvetica Neue", "sans-serif"'
            }}
        >
            <Layout>
                <View params={params} />
            </Layout>
        </Provider>
    )
}

export default render
