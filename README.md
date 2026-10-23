# livingwaterbiblestudy

The Bible view supports NET (New English Translation) through the
[bible.org passage API](https://labs.bible.org/api_web_service), both as a main
version and in verse comparisons. Chapters are fetched over HTTPS and cached
in memory. NET read-aloud uses English browser text-to-speech.

The Bible view attributes the selected version's text provider: bible.org for
NET and [FHL Bible tools](https://bible.fhl.net/) for the other versions.

The NET passage API does not provide keyword search; select another version
for keyword searches. Strong's-number search continues to use the existing
provider.

Build the production JavaScript bundle with:

```powershell
npm exec --yes --package=webpack@5 --package=webpack-cli -- webpack --mode production
```