.PHONY: dox

# Generate marginalia dox and push them to GitHub pages for this repo
# You should do this from an up-to-date `master` branch without untracked local changes
dox:
	git checkout master
	git pull
	lein marg
	cp ./docs/uberdoc.html ./uberdoc.html
	git checkout gh-pages
	git pull
	rm index.html
	mv uberdoc.html index.html
	git add index.html
	git commit -m "Updated dox."
	git push --set-upstream origin gh-pages
	git checkout master
	rm uberdoc.html
