var path    = require('path');
var fs      = require('fs');

var generatedDocsPath = __dirname + "/../generated/api";

var versions = {
    // minute
    pollInterval : 60000,
    // last updated
    ts : -1,
    inProgress : false,
    cached : [],
    latestVersion : undefined
}

var bundles = {
    // minute
    pollInterval : 60000,
    inProgress : false,
    // last updated
    ts : -1,
    cached : {}
}

function isNumericVersion (version) {
    return version.split('.').every(v => !isNaN(v));
}

/**
 * Sort latest first.
 * 
 * @param {string} a 
 * @param {string} b 
 */
function sortVersion (a,b) {
    // Show non-numeric versions on top
    var versionA = a.split('.');
    var versionB = b.split('.');
    if (isNaN(versionA[0])) {
        return -1;
    }
    if (isNaN(versionB[0])) {
        return 1;
    }
    for (var i = 0; i < versionA.length; i++) {
        if (i >= versionB.length) {
            return -1;
        }
        var result = versionB[i] - versionA[i];
        if (result !== 0) {
            return result;
        }
    }
    if (versionA.length < versionB.length) {
        return 1;
    }
    return 0;
};

function getVersions(callback) {
    if(typeof callback !== 'function') {
        console.log('No callback given to getVersions');
        return;
    }
    if(versions.ts > new Date().getTime() + versions.pollInterval || versions.inProgress) {
        callback(versions.cached);
        return;
    }
    versions.inProgress = true;
    fs.readdir(generatedDocsPath, function (err, files) {
        if (err) {
            console.log('Error reading directory that should contain api docs: ' + generatedDocsPath, err);
            callback(versions.cached);
            return;
        }
        var values = [];
        var erronousVersions = 0;
        files.forEach(function(ver) {
            getBundles(ver, function(api) {
                if(!api) {
                    erronousVersions++;
                    return;
                }
                values.push(api.version);
                if(values.length + erronousVersions === files.length) {
                    // that was the last one
                    values.sort(sortVersion);
                    versions.latestVersion = _determineLatestVersion(values);
                    versions.cached = values;
                    versions.ts = new Date().getTime();
                    if (typeof callback === 'function') {
                        callback(versions.cached);
                    }
                    versions.inProgress = false;
                }
            });
        });
    });
}

function _determineLatestVersion (versions = []) {
    var numerics = versions.filter(function (version) {
        return isNumericVersion(version);
    }).sort(sortVersion);
    if (numerics.length !== 0) {
        return numerics[0];
    } else {
        // default to non-numeric
        return versions[0];
    }
}

function getLatestVersion () {
    if (!versions.latestVersion) {
        // Not populated yet! Read sync.
        try {
            versions.latestVersion = _determineLatestVersion(fs.readdirSync(generatedDocsPath));
        } catch (err) {
            console.error('Populating latest api version failed');
        }
    }
    return versions.latestVersion;
};

function getEvents(version, callback) {
    getJson('events.json', version, callback);
}

function getRequests(version, callback) {
    getJson('requests.json', version, callback);
}

function getBundles(version, callback) {
    getJson('bundles.json', version, callback);
}

function getJson(filename, version, callback) {
    if (version === 'latest') {
        version = getLatestVersion();
    }
    if(bundles.cached[version] && bundles.ts > new Date().getTime() + bundles.pollInterval) {
        callback(bundles.cached[version]);
        return;
    }
    bundles.inProgress = true;
    var dirPath = generatedDocsPath + '/' + version;
    fs.stat(dirPath, function(err, stat) {
        if(err) {
            console.log('Error reading dir ' + dirPath);
            callback();
            return;
        }
        if(!stat.isDirectory()) {
            console.log('Api doc folder contains non-dir file: ' + dirPath);
            callback();
            return;
        }
        var filePath = dirPath + '/' + filename;
        fs.readFile(filePath, 'utf8', function(err, data)  {
            if(err) {
                console.log('Error reading file ' + filename + ' from path ' + filePath);
                callback();
                return;
            }
            bundles.cached[version] = {
                version : version,
                api : JSON.parse(data)
            };
            bundles.ts = new Date().getTime();
            callback(bundles.cached[version]);
            bundles.inProgress = false;
        });
    });
}


function getChangelog(version, callback) {
    var mdDocPath = path.join(generatedDocsPath, version, 'CHANGELOG.html');
    fs.readFile(mdDocPath, 'utf8', function (err, fileContent) {
        if (err) {
            console.error('Error reading changelog for version ' + version, err);
            callback();
            return;
        }
        callback(fileContent);
    });

}
function getBundleDoc(version, bundle, callback) {
    if (version === 'latest') {
        version = getLatestVersion();
    }
    if(!bundle) {
        // no bundle requested, respond with log
        getChangelog(version, callback);
        return;
    }
    if(bundle.endsWith('.md')) {
        bundle = bundle.replace('.md', '.html');
    }
    else {
        bundle = bundle + '/bundle.html';
    }
    var mdDocPath = path.join(generatedDocsPath, version, bundle);
    fs.readFile(mdDocPath, 'utf8', function (err, fileContent) {
        if (err) {
            console.error('Error reading bundle doc for version ' + version + ' and bundle ' + bundle, err);
            callback();
            return;
        }
        callback(fileContent);
    });
}

module.exports = {
    getLatestVersion: getLatestVersion,
    getVersions : getVersions,
    getBundles : getBundles,
    getRequests : getRequests,
    getEvents : getEvents,
    doc : getBundleDoc,
    log : getChangelog
}