const inquirer = require('inquirer');
const sequential = require('promise-sequential');
const categoryManager = require('../../lib/category-manager');

function add(context){
    const {
        availableServices,
        enabledServices,
        disabledServices
    } = categoryManager.getCategoryStatus(context);

    if(availableServices.length > 0){
        if(disabledServices.length > 1){
            const answers = await inquirer.prompt({
                type: 'checkbox',
                name: 'selectedServices',
                message: 'Please select the service(s) to add.',
                choices: disabledServices,
                default: disabledServices[0],
            });
            answers.selectedServices.forEach(service => {
                tasks.push(()=>categoryManager.runServiceAction(context, service, 'enable'));
            }); 
            return sequential(tasks);
        }else if(disabledServices.length == 1){
            categoryManager.runServiceAction(context, disabledServices[0], 'enable'); 
        }else{
            throw new Error('Hosting is already fully enabled.')
        }
    }else{
        throw new Error('Hosting is not available from enabled providers.')
    }
}

function remove(context){
    const {
      availableServices,
      enabledServices,
      disabledServices
    } = categoryManager.getCategoryStatus(context);

    if(enabledServices.length > 1){
        const answers = await inquirer.prompt({
            type: 'checkbox',
            name: 'selectedServices',
            message: 'Please the service(s) to remove.',
            choices: enabledServices,
            default: enabledServices[0],
        });
        if(answers.selectedServices.length < enabledServices.length){
          const tasks = []; 
          answers.selectedServices.forEach(service => {
            tasks.push(()=>categoryManager.runServiceAction(context, service, 'disable'));
          }); 
          return sequential(tasks);
        }else{
          return categoryManager.removeCategory(context); 
        }
    }else if(enabledServices.length == 1){
        return categoryManager.removeCategory(context); 
    }else{
        throw new Error('No hosting service is enabled.')
    }
}

function publish(context, service, args){
    const {
        availableServices,
        enabledServices,
        disabledServices
    } = categoryManager.getCategoryStatus(context);

    if(enabledServices.length > 0){
        if(enabledServices.includes(service)){
            return categoryManager.runServiceAction(context, service, 'pubish', args);
        }else{
            throw new Error('Hosting service ' + service + ' is NOT enabled.');
        }
    }else{
        throw new Error('No hosting service is enabled.')
    }
}

module.exports = {
    add,
    remove,
    publish
}