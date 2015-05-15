.PHONY: dox

# Generate Marginalia dox and push them to GitHub pages for this repo
# You should do this from an up-to-date `master` branch without untracked local changes
dox:
	git checkout master
	git pull
	lein marg
	cp ./docs/uberdoc.html ~/Desktop/index.html.temp
	git checkout gh-pages
	git pull
	rm index.html
	mv ~/Desktop/index.html.temp index.html
	git add index.html
	git commit -m "Updated dox."
	git push
	git checkout master
