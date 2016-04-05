import React from 'react';
import Toggle from '../src/components/Toggle.jsx';
import { storiesOf, action } from '@kadira/storybook';

storiesOf('Toggle', module)
  .add('on', () => {
    return <Toggle value={true} onChange={action('onChange')} />
  })
  .add('off', () => {
    return <Toggle value={false} onChange={action('onChange')} />
  });
