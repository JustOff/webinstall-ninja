@echo off
set VER=1.0.1

sed -i -E "s/version>.+?</version>%VER%</" install.rdf
sed -i -E "s/version>.+?</version>%VER%</; s/download\/.+?\/webinstall-ninja-.+?\.xpi/download\/%VER%\/webinstall-ninja-%VER%\.xpi/" update.xml

set XPI=webinstall-ninja-%VER%.xpi
if exist %XPI% del %XPI%
zip -r9q %XPI% bootstrap.js icon.png install.rdf
