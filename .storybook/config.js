import { configure } from '@kadira/storybook';

function loadStories() {
  require('../frontend/stories/');
}

configure(loadStories, module);
