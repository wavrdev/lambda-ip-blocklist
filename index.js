const fetch = require('node-fetch');
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});

exports.handler = async (event, context, callback) => {
   //get file list from git repo
   const gitRepoTree = await fetch('https://api.github.com/repos/firehol/blocklist-ipsets/commits/bc751f7c5d2e47408a3528d52d20b74a9fba60b9').then(response => response.json());
   const gitFileList = gitRepoTree["files"]; 
    
   //loop through file list and store information in a list 
   let ipsets = [];
    gitFileList.forEach(gitFile => {
        if(gitFile["filename"].split('.').pop() == "ipset" || gitFile["filename"].split('.').pop() == "netset")
        {
            let thisIpset = {listName : gitFile["filename"].replace(/\.[^/.]+$/, ""), listUrl : gitFile["raw_url"], listType : gitFile["filename"].split('.').pop(), ipAddresses : [] };   
            ipsets.push(thisIpset);
        }
    });
	//go to each raw file and parse line by line
	//add the IP addresses to the associated block list
    let ipsetsFull = [];
    ipsets.forEach(ipset => {
        ipsetsFull.push(
             fetch(ipset.listUrl)
            .then(res => res.text())
            .then(res => {
                const lines = res.split(/\r?\n/);
                 var ipList = [];
                 for(var i=0; i<lines.length; i++) 
                 {
                     if(lines[i].replace(/#(.*?)(\n|$)/g,"") != "")
                        {
                           ipList.push(lines[i]);   
                        }
                 } 
                let thisFullIpset = {listName : ipset.listName, listUrl : ipset.listUrl, listType : ipset.listType, ipAddresses : ipList };  
                return thisFullIpset;
            })
        );
    });
	//wait for IP lists to finish processing
	//on each list call function to store in dynamo database
    for await (let ipsetFull of ipsetsFull) 
    {
        const requestId = guidGenerator();
        await createIpset(requestId, ipsetFull).then(() => {
            callback(null, {
                statusCode: 201,
                body: '',
                headers: {
                    'Access-Control-Allow-Origin' : '*'
                }
            });
        }).catch((err) => {
            console.error(err)
            }) 
    }
};
//store info JSON formatted and insert in database
function createIpset(requestId, ipsetFull) {
    const params = {
        TableName: 'blocklist_ipsets',
        Item: {
            'id' : requestId,
            'listName' : ipsetFull.listName,
            'listType' : ipsetFull.listType,
            'listUrl' : ipsetFull.listUrl,
            'ipAddresses' : ipsetFull.ipAddresses
        }
    }
    return ddb.put(params).promise();
}
//generate a unique ID in a unique way (I did not create this code)
function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}
