const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');

const category = 'interactions';
const parametersFileName = 'lex-params.json';
const serviceName = 'Lex';
const templateFileName = 'lex-cloudformation-template.json.ejs';
var fuzzy = require('fuzzy');

async function addWalkthrough(context, defaultValuesFilename, serviceMetadata) {
  return configure(context, defaultValuesFilename, serviceMetadata);
}

function updateWalkthrough(context, defaultValuesFilename, serviceMetadata) {
  // const resourceName = resourceAlreadyExists(context);
  const { amplify } = context;
  const { amplifyMeta } = amplify.getProjectDetails();

  const lexResources = {};

  Object.keys(amplifyMeta[category]).forEach((resourceName) => {
    if (amplifyMeta[category][resourceName].service === serviceName) {
      lexResources[resourceName] = amplifyMeta[category][resourceName];
    }
  });

  if (!amplifyMeta[category] || Object.keys(lexResources).length === 0) {
    context.print.error('No resources to update. You need to add a resource.');
    process.exit(0);
    return;
  }
  const resources = Object.keys(lexResources);
  const question = [{
    name: 'resourceName',
    message: 'Specify the resource that you would want to update',
    type: 'list',
    choices: resources,
  }];

  return inquirer.prompt(question)
    .then(answer => configure(
      context, defaultValuesFilename,
      serviceMetadata, answer.resourceName,
    ));
}

// Goes through Lex walkthrough
async function configure(context, defaultValuesFilename, serviceMetadata, resourceName) {
  const { amplify, print } = context;
  let { inputs, samples } = serviceMetadata;

  const defaultValuesSrc = `${__dirname}/../default-values/${defaultValuesFilename}`;
  const { getAllDefaults } = require(defaultValuesSrc);

  const defaultValues = getAllDefaults(amplify.getProjectDetails());

  const projectBackendDirPath = context.amplify.pathManager.getBackendDirPath();

  print.info('');
  print.info('Welcome to the Amazon Lex chatbot wizard');
  print.info('You will be asked a series of questions to help determine how to best construct your chatbot.');
  print.info('');

  // Ask resource name question

  const resourceQuestion = {
    type: inputs[0].type,
    name: inputs[0].key,
    message: inputs[0].question,
    validate: amplify.inputValidation(inputs[0]),
    default: (answer) => {
      const defaultValue = defaultValues[inputs[0].key];
      return answer.resourceName || defaultValue;
    }
  };

  let answer = {};
  let startChoice;

  if (!resourceName) {
    answer = await inquirer.prompt(resourceQuestion);
    resourceName = answer.resourceName;

    // If it is a new chatbot, ask if they want to start with a sample or from scratch
    const startQuestion = {
      type: inputs[1].type,
      name: inputs[1].key,
      message: inputs[1].question,
      choices: inputs[1].options
    }
  
    startChoice = await inquirer.prompt(startQuestion);
  }
  else {
    startChoice = {startChoice: "Update an existing chatbot"};
  }

  //console.log(answer);
  //console.log("resourceName:",resourceName);

  //console.log(answer);

  

  //console.log(startChoice[inputs[1].key]);

  const botNameQuestion = {
    type: inputs[3].type,
    name: inputs[3].key,
    message: inputs[3].question,
    validate: amplify.inputValidation(inputs[3]),
    //default: defaultValues[inputs[3].key]
  } 

  const coppaQuestion = {
    type: inputs[4].type,
    name: inputs[4].key,
    message: inputs[4].question,
    default: inputs[4].default
  }

  let botName;
  let intentName;
  let answers;
  let parameters;
  let deleteIntentConfirmed = false;

  // Follows path based on start choice

  // Chooses to start with a sample
  if (startChoice[inputs[1].key] === "Start with a sample"){
    // TODO: get list of samples from Lex, if possible
    const sampleChatbotQuestion = {
      type: inputs[2].type,
      name: inputs[2].key,
      message: inputs[2].question,
      choices: inputs[2].options
    }
    let botName = await inquirer.prompt(sampleChatbotQuestion);
    botName = botName[inputs[2].key];

    let coppa = await inquirer.prompt(coppaQuestion);
    coppa = coppa[inputs[4].key];
    if (coppa) { 
      print.info('');
      print.info('You must obtain any required verifiable parental consent under COPPA.');
      print.info('');
    }

    let intents = samples[botName];

    answers = {
      "resourceName": resourceName,
      "intents": intents,
      "outputVoice": false,
      "botName": botName,
      "coppa": coppa
    }
  }

  // Chooses to start with an existing chatbot
  else if (startChoice[inputs[1].key] === "Update an existing chatbot") {
    //console.log('update');
    // TODO: get list of chatbots from cloud/backend
    if (resourceName) {
      //console.log(resourceName);
      const resourceDirPath = path.join(projectBackendDirPath, category, resourceName);
      const parametersFilePath = path.join(resourceDirPath, parametersFileName);
      try {
        parameters = JSON.parse(fs.readFileSync(parametersFilePath));
      } catch (e) {
        parameters = {};
      }
    }
    else {
      context.print.error("No chatbots to update");
    }
    // console.log(parameters);

    const addUpdateIntentQuestion = {
      type: inputs[6].type,
      name: inputs[6].key,
      message: inputs[6].question,
      choices: inputs[6].options
    }
    let utterances = [];
    let intents = [];
    let slots = [];
    let newSlotTypes = [];
    const intentChoice = await inquirer.prompt(addUpdateIntentQuestion);
    if (intentChoice[inputs[6].key] === "Update an existing intent") {
      // TODO: get intents from cloud/backend
      const intentList = parameters.intents.map(x => x.intentName);
      const chooseIntent = {
        type: inputs[7].type,
        name: inputs[7].key,
        message: inputs[7].question,
        choices: intentList
      }
      intentName = await inquirer.prompt(chooseIntent);
      intentName = intentName[inputs[7].key];

      const addUtteranceQuestion = {
        type: inputs[8].type,
        name: inputs[8].key,
        message: inputs[8].question,
        default: inputs[8].default
      }
      let addUtteranceAnswer = await inquirer.prompt(addUtteranceQuestion);
      if (addUtteranceAnswer[inputs[8].key]) {
        utterances = (await addUtterance(context, intentName, botName, resourceName, serviceMetadata));
      }

      const addSlotQuestion = {
        type: inputs[9].type,
        name: inputs[9].key,
        message: inputs[9].question,
        default: inputs[9].default
      }
      let addSlotAnswer = await inquirer.prompt(addSlotQuestion);

      let slotReturn = [];
      if (addSlotAnswer[inputs[9].key]) {
        slotReturn = await addSlot(context, intentName, botName, resourceName, serviceMetadata, parameters);
      }
      if (slotReturn.length > 1) {
        slots = slotReturn[0];
        newSlotTypes = slotReturn[1];
        // console.log(slots);
        // console.log(newSlotTypes);
      }
      else { slots = slotReturn }
    }
    else if (intentChoice[inputs[6].key] === "Add an intent") {
      //console.log("resourceName:",resourceName);
      let continueAddingIntents = true;
      const addAnotherIntentQuestion = {
        type: inputs[23].type,
        name: inputs[23].key,
        message: inputs[23].question,
        default: inputs[23].default
      }
      while (continueAddingIntents) {
        intents.push(await addIntent(context, botName, resourceName, serviceMetadata, intents, parameters));
        continueAddingIntents = await inquirer.prompt(addAnotherIntentQuestion);
        continueAddingIntents = continueAddingIntents[inputs[23].key];
        //console.log(continueAddingIntents);
      }
    }
    else if (intentChoice[inputs[6].key] === "Delete an intent"){
      const intentList = parameters.intents.map(x => x.intentName);
      const chooseIntent = {
        type: inputs[7].type,
        name: inputs[7].key,
        message: inputs[7].question,
        choices: intentList
      }
      intentName = await inquirer.prompt(chooseIntent);
      intentName = intentName[inputs[7].key];

      const deleteIntentConfirmation = {
        type: inputs[31].type,
        name: inputs[31].key,
        message: inputs[31].question
      }
      deleteIntentConfirmed = await inquirer.prompt(deleteIntentConfirmation);
      deleteIntentConfirmed = deleteIntentConfirmed[inputs[31].key];
    }
    else {
      context.print.error("Valid option not chosen");
    }
    answers = {
      "resourceName": resourceName,
      "botName": parameters.botName,
      "intentName": intentName,
      "utterances": utterances,
      "intents": intents,
      "slots": slots,
      "newSlotTypes": newSlotTypes
    }
  }

  // Chooses to create a new chatbot
  else if (startChoice[inputs[1].key] === "Start from scratch") {
    //console.log('scratch');
    botName = await inquirer.prompt(botNameQuestion);
    botName = botName[inputs[3].key];

    const outputVoiceQuestion = {
      type: inputs[10].type,
      name: inputs[10].key,
      message: inputs[10].question,
      choices: inputs[10].options
    }
    let outputVoice = await inquirer.prompt(outputVoiceQuestion);
    outputVoice = outputVoice[inputs[10].key];
    //console.log(outputVoice);

    const sessionTimeoutQuestion = {
      type: inputs[11].type,
      name: inputs[11].key,
      message: inputs[11].question,
      default: defaultValues[inputs[11].key]
    }
    let sessionTimeout = await inquirer.prompt(sessionTimeoutQuestion);
    sessionTimeout = sessionTimeout[inputs[11].key];

    let coppa = await inquirer.prompt(coppaQuestion);
    coppa = coppa[inputs[4].key];
    if (coppa) { 
      print.info('');
      print.info('You must obtain any required verifiable parental consent under COPPA.');
      print.info('');
    }

    print.info('');
    print.info('First create an intent for your new chatbot. An intent represents an action that the user wants to perform.');
    print.info('');

    let continueAddingIntents = true;
    const addAnotherIntentQuestion = {
      type: inputs[23].type,
      name: inputs[23].key,
      message: inputs[23].question,
      default: inputs[23].default
    }
    let intents = [];
    while (continueAddingIntents) {
      intents.push(await addIntent(context, botName, resourceName, serviceMetadata, intents, parameters));
      continueAddingIntents = await inquirer.prompt(addAnotherIntentQuestion);
      continueAddingIntents = continueAddingIntents[inputs[23].key];
      //console.log(continueAddingIntents);
    }

    answers = {
      "resourceName": resourceName,
      "botName": botName,
      "intents": intents,
      "outputVoice": outputVoice,
      "sessionTimeout": sessionTimeout,
      "coppa": coppa,
    }
  } 
  else {
    context.print.error("Valid option not chosen");
  }

  if (parameters) {
    if (answers.intentName) {
      if (deleteIntentConfirmed) {
        parameters.intents = parameters.intents.filter( intent => intent.intentName !== answers.intentName );
      }
      else {
        parameters.intents.forEach(function(intent) {
          if (intent.intentName == answers.intentName) {
            if (answers.utterances) {
              intent.utterances = intent.utterances.concat(answers.utterances);
            }
            if (answers.slots) {
              intent.slots = intent.slots.concat(answers.slots);
            }
            if (answers.newSlotTypes) {
              if (intent.newSlotTypes) {
                intent.newSlotTypes = intent.newSlotTypes.concat(answers.newSlotTypes);
              }
              else {
                intent.newSlotTypes = answers.newSlotTypes;
              }
            }
          }
        })
      }
    }
    else {
      if (!answers.intents) {
        context.print.error("Valid option not chosen");
      }
      else {
        parameters.intents = parameters.intents.concat(answers.intents);
      }
    }
    answers = parameters;
  }
  //console.log(answers);
  //answers.intents.forEach( intent => console.log(intent.slots));
  return answers;
}

async function addIntent(context, botName, resourceName, serviceMetadata, intents, parameters) {
  let { inputs } = serviceMetadata;
  const { amplify, print } = context;
  // console.log("Adding intent...");
  // console.log("botName:",botName,"resourceName:",resourceName);

  const intentNameQuestion = {
    type: inputs[12].type,
    name: inputs[12].key,
    message: inputs[12].question,
    validate: amplify.inputValidation(inputs[12])
  }

  let intentName;
  intentName = await inquirer.prompt(intentNameQuestion);
  intentName = intentName[inputs[12].key];

  // Checks for duplicate intent names
  while ((intents.filter( intent => intent.intentName === intentName ).length > 0)
          || (parameters && parameters.intents.filter( intent => intent.intentName === intentName ).length > 0)) {
    print.info('');
    print.info('Intent names must be unique');
    print.info('');
    intentName = await inquirer.prompt(intentNameQuestion);
    intentName = intentName[inputs[12].key];
  }

  let utterances = await addUtterance(context, intentName, botName, resourceName, serviceMetadata);
  // console.log(utterances);

  print.info('');
  print.info('Now, add a slot to your intent. A slot is data the user must provide to fulfill the intent.');
  print.info('');

  let slots = [];
  let newSlotTypes = [];
  let slotReturn = await addSlot(context, intentName, botName, resourceName, serviceMetadata, parameters);
  if (slotReturn.length > 1) {
    newSlotTypes = slotReturn[1];
    // console.log(slots);
    // console.log(newSlotTypes);
  }
  slots = slotReturn[0];

  const addConfirmationQuestion = {
    type: inputs[18].type,
    name: inputs[18].key,
    message: inputs[18].question,
    default: inputs[18].default
  }
  let confirmationQuestion;
  let cancelMessage;
  const addConfirmation = await inquirer.prompt(addConfirmationQuestion);
  if (addConfirmation[inputs[18].key]) {
    const confirmationQuestionQuestion = {
      type: inputs[19].type,
      name: inputs[19].key,
      message: inputs[19].question,
      validate: amplify.inputValidation(inputs[19])
    }
    confirmationQuestion = await inquirer.prompt(confirmationQuestionQuestion);
    confirmationQuestion = confirmationQuestion[inputs[19].key] 

    const cancelMessageQuestion = {
      type: inputs[20].type,
      name: inputs[20].key,
      message: inputs[20].question,
      validate: amplify.inputValidation(inputs[20])
    }
    cancelMessage = await inquirer.prompt(cancelMessageQuestion);
    cancelMessage = cancelMessage[inputs[20].key] ;
  }

  const intentFulfillmentQuestion = {
    type: inputs[21].type,
    name: inputs[21].key,
    message: inputs[21].question,
    choices: inputs[21].options
  }
  let intentFulfillment = await inquirer.prompt(intentFulfillmentQuestion);
  intentFulfillment = intentFulfillment[inputs[21].key];
  let pathsAnswer;
  if (intentFulfillment === "lambdaFunction") {
    pathsAnswer = await askPaths(context);
    // console.log(pathsAnswer);
    // TODO: get lambda functions from backend/cloud
    /*lambdaFunctions = ["lambda1","lambda2","lambda3"];
    const lambdaFunctionQuestion = {
      type: inputs[22].type,
      name: inputs[22].key,
      message: inputs[22].question,
      choices: lambdaFunctions
    }
    let lambdaFunction = await inquirer.prompt(lambdaFunctionQuestion);
    lambdaFunction = lambdaFunction[inputs[22].key];*/
  }

  return {
    "pathsAnswer": pathsAnswer,
    "cancelMessage": cancelMessage,
    "confirmationQuestion": confirmationQuestion,
    "slots": slots,
    "utterances": utterances,
    "intentName": intentName,
    "slots": slots,
    "newSlotTypes": newSlotTypes
  }
}

async function addUtterance(context, intentName, botName, resourceName, serviceMetadata) {
  let { inputs } = serviceMetadata;
  const { amplify, print } = context;
  const addAnotherUtteranceQuestion = {
    type: inputs[24].type,
    name: inputs[24].key,
    message: inputs[24].question,
    default: inputs[24].default
  }
  const utteranceQuestion = {
    type: inputs[13].type,
    name: inputs[13].key,
    message: inputs[13].question,
    validate: amplify.inputValidation(inputs[13])
  }
  let addAnotherUtterance = true;
  let utterances = [];
  while (addAnotherUtterance) {
    // console.log("Adding utterance...");
    // console.log("resourceName:",resourceName,"botName:",botName,"intentName:",intentName);

    let utterance = await inquirer.prompt(utteranceQuestion);
    utterance = utterance[inputs[13].key];
    utterances.push(utterance);

    addAnotherUtterance = await inquirer.prompt(addAnotherUtteranceQuestion);
    addAnotherUtterance = addAnotherUtterance[inputs[24].key];
  }
  return utterances;
}

async function addSlot(context, intentName, botName, resourceName, serviceMetadata, parameters) {
  let { inputs } = serviceMetadata;
  const { amplify, print } = context;
  const addAnotherSlotQuestion = {
    type: inputs[25].type,
    name: inputs[25].key,
    message: inputs[25].question,
    default: inputs[25].default
  }
  const slotNameQuestion = {
    type: inputs[14].type,
    name: inputs[14].key,
    message: inputs[14].question,
    validate: amplify.inputValidation(inputs[14])
  }
  const slotPromptQuestion = {
    type: inputs[16].type,
    name: inputs[16].key,
    message: inputs[16].question,
    validate: amplify.inputValidation(inputs[16])
  }
  const slotRequiredQuestion = {
    type: inputs[17].type,
    name: inputs[17].key,
    message: inputs[17].question,
    default: inputs[17].default
  }
  let addAnotherSlot = true;
  let slots = [];
  let newSlotTypeAdded = false;
  let newSlotTypes = [];
  while (addAnotherSlot) {
    // console.log("Adding slot...");
    // console.log("resourceName:",resourceName,"botName:",botName,"intentName:",intentName);

    let slot = {name:"", type:"", prompt:"", required: true, customType: false};
    slot.name = await inquirer.prompt(slotNameQuestion);
    slot.name = slot.name[inputs[14].key];
    
    // Checks for duplicate slot names
    while ((slots.filter( existingSlot => existingSlot.name === slot.name ).length > 0)
            || (parameters && parameters.intents.filter( intent => intent.intentName === intentName )[0] && parameters.intents.filter( intent => intent.intentName === intentName )[0].slots.filter( existingSlot => existingSlot.name === slot.name ).length > 0)) {
      print.info('');
      print.info('Slot names must be unique');
      print.info('');
      slot.name = await inquirer.prompt(slotNameQuestion);
      slot.name = slot.name[inputs[14].key];
    }
      
    slot.type = await getSlotType(context, serviceMetadata, newSlotTypes, parameters);
    //console.log(slot.type.slotTypeDescription);
    if (slot.type.slotTypeDescription) {
      newSlotTypes.push({
        slotType: slot.type.slotType,
        slotTypeDescription: slot.type.slotTypeDescription,
        slotValues: slot.type.slotValues
      });
      slot.customType = true;
      newSlotTypeAdded = true;
      slot.type = newSlotTypes[newSlotTypes.length-1].slotType;
    }
    else if (slot.type[1]) {
      slot.customType = true;
      slot.type = slot.type[0];
    } else {
      slot.type = slot.type[0];
    }

    // console.log("newSlotTypes======", newSlotTypes);

    slot.prompt = await inquirer.prompt(slotPromptQuestion);
    slot.prompt = slot.prompt[inputs[16].key];

    slot.required = await inquirer.prompt(slotRequiredQuestion);
    slot.required = slot.required[inputs[17].key];

    slots.push(slot);

    addAnotherSlot = await inquirer.prompt(addAnotherSlotQuestion);
    addAnotherSlot = addAnotherSlot[inputs[25].key];
  }
  //console.log("slots", slots);
  if (newSlotTypeAdded) { return [slots, newSlotTypes]; }
  return [slots];
}

async function getSlotType(context, serviceMetadata, newSlotTypes, parameters) {
  let { inputs } = serviceMetadata;
  const { amplify, print } = context;
  let slotType;
  inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
  
  const slotTypeChoiceQuestion = {
    type: inputs[26].type,
    name: inputs[26].key,
    message: inputs[26].question,
    choices: inputs[26].options
  }
  slotTypeChoice = await inquirer.prompt(slotTypeChoiceQuestion);
  if (slotTypeChoice[inputs[26].key] == "Amazon built-in slot type") {
    let slotTypeOptions = '';
    let builtInSlotTypes = [];
    let builtInSlotTypesReturn;
    do {
      builtInSlotTypesReturn = await context.amplify.executeProviderUtils(context, 'awscloudformation', 'getBuiltInSlotTypes', slotTypeOptions);
      //console.log("return:",builtInSlotTypesReturn);
      builtInSlotTypes = builtInSlotTypes.concat(builtInSlotTypesReturn.slotTypes.map( slotType => slotType.signature ));
      slotTypeOptions = builtInSlotTypesReturn.nextToken;
    } while (slotTypeOptions);

    function searchSlotTypes(answers, input) {
      input = input || '';
      return new Promise(function(resolve) {
        var fuzzyResult = fuzzy.filter(input, builtInSlotTypes);
        resolve(
          fuzzyResult.map(function(el) {
            return el.original;
          })
        );
      });
    }

    const slotTypeQuestion = {
      type: "autocomplete",
      name: inputs[15].key,
      message: inputs[15].question,
      source: searchSlotTypes
    }
    slotType = await inquirer.prompt(slotTypeQuestion);
    return [slotType[inputs[15].key], false];
  }
  else if (slotTypeChoice[inputs[26].key] == "Slot type I've already made") {
    let slotTypes = await context.amplify.executeProviderUtils(context, 'awscloudformation', 'getSlotTypes');
    slotTypes = slotTypes.slotTypes.map( slotType => slotType.name );
    if (newSlotTypes) {
      slotTypes = slotTypes.concat(newSlotTypes.map( slotType => slotType.slotType ));
    }
    if (parameters) {
      if (parameters.intents) {
        for (let i = 0; i < parameters.intents.length; i++) {
          if (parameters.intents[i].newSlotTypes) {
            slotTypes = slotTypes.concat(parameters.intents[i].newSlotTypes.map( slotType => slotType.slotType ));
          }
        }
      }
    }
    slotTypes = slotTypes.filter( (value, index, self) => self.indexOf(value) === index );

    const slotTypeQuestion = {
      type: "list",
      name: inputs[15].key,
      message: inputs[15].question,
      choices: slotTypes
    }
    slotType = await inquirer.prompt(slotTypeQuestion);
    return [slotType[inputs[15].key], true];
  }
  else if (slotTypeChoice[inputs[26].key] == "Create a new slot type") {
    const slotTypeNameQuestion = {
      type: inputs[27].type,
      name: inputs[27].key,
      message: inputs[27].question,
      validate: amplify.inputValidation(inputs[27])
    }
    const slotTypeDescriptionQuestion = {
      type: inputs[28].type,
      name: inputs[28].key,
      message: inputs[28].question,
      validate: amplify.inputValidation(inputs[28])
    }
    const slotTypeValueQuestion = {
      type: inputs[29].type,
      name: inputs[29].key,
      message: inputs[29].question,
      validate: amplify.inputValidation(inputs[29])
    }
    const continueAddingSlotValuesQuestion = {
      type: inputs[30].type,
      name: inputs[30].key,
      message: inputs[30].question,
      default: inputs[30].default
    }
    slotType = await inquirer.prompt(slotTypeNameQuestion);
    slotType = slotType[inputs[27].key];

    let slotTypeDescription = await inquirer.prompt(slotTypeDescriptionQuestion);
    slotTypeDescription = slotTypeDescription[inputs[28].key];

    let continueAddingSlotValues = true;
    let slotValues = []
    while (continueAddingSlotValues) {
      let slotValue = await inquirer.prompt(slotTypeValueQuestion);
      slotValue = slotValue[inputs[29].key];
      
      // Checks for duplicate slot values
      while (slotValues.filter( existingSlotValue => existingSlotValue === slotValue ).length > 0) {
        print.info('');
        print.info('Slot values must be unique');
        print.info('');
        slotValue = await inquirer.prompt(slotTypeValueQuestion);
        slotValue = slotValue[inputs[29].key];
      }
        
      slotValues.push(slotValue);

      continueAddingSlotValues = await inquirer.prompt(continueAddingSlotValuesQuestion);
      continueAddingSlotValues = continueAddingSlotValues[inputs[30].key];
    }
    // console.log(slotValues);

    return {
      "slotType": slotType,
      "slotTypeDescription": slotTypeDescription,
      "slotValues": slotValues
    }
  }
  else {
    context.print.error("Valid option not chosen");
    return;
  }
}

/* Code from function category to get lambda functions */
async function askPaths(context) {
  /* TODO: add spinner when
  checking if the account had
  functions deployed and hide the option from the menu */
  const existingLambdaArns = true;
  const existingFunctions = functionsExist(context);

  const choices = [
    {
      name: 'Create a new Lambda function',
      value: 'newFunction',
    },
  ];

  if (existingLambdaArns) {
    choices.push({
      name: 'Use a Lambda function already deployed on AWS',
      value: 'arn',
    });
  }

  if (existingFunctions) {
    choices.push({
      name: 'Use a Lambda function already added in the current Amplify project',
      value: 'projectFunction',
    });
  }
  const questions = [
    {
      name: 'name',
      type: 'input',
      message: 'Provide a path, e.g. /items',
      default: '/items',
    },
    {
      name: 'functionType',
      type: 'list',
      message: 'Select lambda source',
      choices,
    },
  ];

  let addAnotherPath;
  const paths = [];
  const dependsOn = [];
  const functionArns = [];

  do {
    const answer = await inquirer.prompt(questions);
    let path = { name: answer.name };
    let lambda;
    do {
      lambda = await askLambdaSource(context, answer.functionType, answer.name);
    } while (!lambda);
    path = { ...path, ...lambda };
    paths.push(path);

    if (lambda.lambdaFunction && !lambda.lambdaArn) {
      dependsOn.push({
        category: 'function',
        resourceName: lambda.lambdaFunction,
        attributes: ['Name', 'Arn'],
      });
    }

    functionArns.push(lambda);


    addAnotherPath = (await inquirer.prompt({
      name: 'anotherPath',
      type: 'confirm',
      message: 'Do you want to add another path?',
      default: false,
    })).anotherPath;
  } while (addAnotherPath);

  return { paths, dependsOn, functionArns };
}

function functionsExist(context) {
  if (!context.amplify.getProjectDetails().amplifyMeta.function) {
    return false;
  }

  const functionResources = context.amplify.getProjectDetails().amplifyMeta.function;
  const lambdaFunctions = [];
  Object.keys(functionResources).forEach((resourceName) => {
    if (functionResources[resourceName].service === 'Lambda') {
      lambdaFunctions.push(resourceName);
    }
  });

  if (lambdaFunctions.length === 0) {
    return false;
  }

  return true;
}

async function askLambdaSource(context, functionType, path) {
  switch (functionType) {
    case 'arn': return askLambdaArn(context);
    case 'projectFunction': return askLambdaFromProject(context);
    case 'newFunction': return newLambdaFunction(context, path);
    default: throw new Error('Type not supported');
  }
}

function newLambdaFunction(context, path) {
  let add;
  try {
    ({ add } = require('amplify-category-function'));
  } catch (e) {
    throw new Error('Function plugin not installed in the CLI. Install it to use this feature');
  }
  context.api = {
    path,
    functionTemplate: 'serverless',
  };
  return add(context, 'awscloudformation', 'Lambda')
    .then((resourceName) => {
      context.print.success('Succesfully added Lambda function locally');
      return { lambdaFunction: resourceName };
    });
}

async function askLambdaArn(context) {
  const regions = await context.amplify.executeProviderUtils(context, 'awscloudformation', 'getRegions');

  const regionQuestion = {
    type: 'list',
    name: 'region',
    message: 'Select lambda function region',
    choices: regions,
  };

  const regionAnswer = await inquirer.prompt([regionQuestion]);

  const lambdaFunctions = await context.amplify.executeProviderUtils(context, 'awscloudformation', 'getLambdaFunctions', { region: regionAnswer.region });

  const lambdaOptions = lambdaFunctions.map(lambdaFunction => ({
    value: {
      resourceName: lambdaFunction.FunctionName.replace(/[^0-9a-zA-Z]/gi, ''),
      Arn: lambdaFunction.FunctionArn,
      FunctionName: lambdaFunction.FunctionName,
    },
    name: `${lambdaFunction.FunctionName} (${lambdaFunction.FunctionArn})`,
  }));

  if (lambdaOptions.length === 0) {
    context.print.error('You do not have any lambda functions configured for the selected region');
    return null;
  }

  const lambdaCloudOptionQuestion = {
    type: 'list',
    name: 'lambdaChoice',
    message: 'Select a Lambda function',
    choices: lambdaOptions,
  };

  const lambdaCloudOptionAnswer = await inquirer.prompt([lambdaCloudOptionQuestion]);

  return { lambdaArn: lambdaCloudOptionAnswer.lambdaChoice.Arn, lambdaFunction: lambdaCloudOptionAnswer.lambdaChoice.FunctionName.replace(/[^0-9a-zA-Z]/gi, '') };
}

async function askLambdaFromProject(context) {
  const functionResources = context.amplify.getProjectDetails().amplifyMeta.function;
  const lambdaFunctions = [];
  Object.keys(functionResources).forEach((resourceName) => {
    if (functionResources[resourceName].service === 'Lambda') {
      lambdaFunctions.push(resourceName);
    }
  });

  const answer = await inquirer.prompt({
    name: 'lambdaFunction',
    type: 'list',
    message: 'Select lambda function to invoke by this path',
    choices: lambdaFunctions,
  });

  return { lambdaFunction: answer.lambdaFunction };
}

function httpGetAsync(theUrl, callback)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() { 
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
            callback(xmlHttp.responseText);
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous 
    xmlHttp.send(null);
}

module.exports = { addWalkthrough, updateWalkthrough };